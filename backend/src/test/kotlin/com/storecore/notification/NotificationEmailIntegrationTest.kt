package com.storecore.notification

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import com.storecore.notification.infrastructure.*
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.dao.DataAccessException
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI
import java.sql.Connection
import java.sql.Timestamp
import java.time.*
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties=["storecore.installation-guard.enabled=false","storecore.inventory.expiry-delay-ms=3600000"])
class NotificationEmailIntegrationTest @Autowired constructor(private val http: TestRestTemplate,private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,private val passwords: Argon2PasswordHasher,private val transactions: TransactionTemplate,
    private val persistence: NotificationPersistencePort,private val readiness: NotificationEmailReadinessPort,
    @LocalServerPort private val port: Int) {
    companion object {
        private val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start(); registry.add("spring.datasource.url") { postgres.jdbcUrl }; registry.add("spring.datasource.username") { postgres.username }; registry.add("spring.datasource.password") { postgres.password }
        }
    }
    private data class Session(val cookie: String,val userId: Long,val sessionId: UUID,val email: String,val role: InternalRole,var csrf: String) {
        fun principal()=InternalUserPrincipal(sessionId,userId,setOf(role))
    }
    @BeforeEach fun isolateConsentAndPendingWork() {
        jdbc.query("SELECT notification_email_invalidate(user_id,'ROLE_LOST') FROM notification_email_preferences WHERE state='ENABLED'",{_,_->Unit})
        jdbc.update("""UPDATE notification_email_delivery SET state=CASE WHEN handoff_started_at IS NULL THEN 'CANCELLED' ELSE 'UNCERTAIN' END,
            lease_owner=NULL,lease_until=NULL,terminal_at=clock_timestamp(),updated_at=clock_timestamp(),reason=CASE WHEN handoff_started_at IS NULL THEN 'INVALIDATED' ELSE 'UNCERTAIN' END
            WHERE state IN ('PENDING','RETRY','LEASED')""")
    }
    private fun provision(role: InternalRole=InternalRole.OPERATOR): Session {
        val email="notification-email-${UUID.randomUUID()}@example.test"
        val id=jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Email','Fixture') RETURNING id",Long::class.java,email,passwords.hash("notification-email-fixture-password".toCharArray()))!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role.name)
        val login=request("/api/v1/internal/auth/login",HttpMethod.POST,"""{"email":"$email","password":"notification-email-fixture-password"}""")
        assertEquals(200,login.statusCode.value(),login.body)
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'),id,jdbc.queryForObject("SELECT id FROM identity_sessions WHERE user_id=? AND revoked_at IS NULL",UUID::class.java,id)!!,email,role,login.headers.getFirst("X-CSRF-Token")!!)
    }
    private fun verify(user: Long) {
        transactions.executeWithoutResult {
            val token=UUID.randomUUID(); val correlation=UUID.randomUUID()
            jdbc.update("""WITH issued AS(SELECT clock_timestamp() value) INSERT INTO identity_email_verification_tokens(id,realm,user_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id)
                SELECT ?,'USER',id,?,email_version,encode(sha256(convert_to(email,'UTF8')),'hex'),value,value+interval '30 minutes',? FROM users CROSS JOIN issued WHERE id=?""",
                token,UUID.randomUUID().toString().replace("-","").repeat(2),correlation,user)
            jdbc.update("UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=? WHERE id=?",correlation,token)
            jdbc.update("""INSERT INTO identity_email_verification_evidence(id,verification_token_id,realm,user_id,email_version,email_digest,verified_at,correlation_id)
                SELECT ?,id,realm,user_id,email_version,email_digest,terminal_at,terminal_correlation_id FROM identity_email_verification_tokens WHERE id=?""",UUID.randomUUID(),token)
        }
    }
    private fun request(path: String,method: HttpMethod,body: String?=null,session: Session?=null,key: UUID?=null,
                        origin: String="http://localhost:4200",csrf: String?=session?.csrf,media: MediaType=MediaType.APPLICATION_JSON): ResponseEntity<String> =
        http.exchange(URI("http://localhost:$port$path"),method,HttpEntity(body,HttpHeaders().apply {
            contentType=media; set(HttpHeaders.ORIGIN,origin); if(session!=null) set(HttpHeaders.COOKIE,session.cookie)
            if(csrf!=null) set("X-CSRF-Token",csrf); if(key!=null) set("Idempotency-Key",key.toString())
        }),String::class.java)
    private val preferencePath="/api/v1/user/notifications/email-preferences"
    private fun enable(revision: Long=0)="""{"operation":"ENABLE","expectedRevision":"$revision","categories":["STOCK"],"severities":["WARNING"]}"""
    private fun disable(revision: Long)="""{"operation":"DISABLE","expectedRevision":"$revision"}"""
    private fun command(session: Session,body: String,key: UUID=UUID.randomUUID())=request("$preferencePath/commands",HttpMethod.POST,body,session,key).also { it.headers.getFirst("X-CSRF-Token")?.let { token -> session.csrf=token } }
    private fun data(response: ResponseEntity<String>): JsonNode=mapper.readTree(response.body!!).path("data")
    private fun now()=jdbc.queryForObject("SELECT clock_timestamp()",Timestamp::class.java)!!.toInstant()
    private fun runtimeJdbc(): JdbcTemplate {
        val source=object : DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password) {
            override fun getConnection(): Connection=super.getConnection().also { it.createStatement().use { statement -> statement.execute("SET ROLE storecore_runtime") } }
        }
        return JdbcTemplate(source)
    }
    private fun queue(): JdbcNotificationEmailQueue {
        val runtime=runtimeJdbc()
        return JdbcNotificationEmailQueue(runtime,TransactionTemplate(DataSourceTransactionManager(requireNotNull(runtime.dataSource))))
    }
    private fun readyProducer(): JdbcNotificationPersistence {
        val runtime=runtimeJdbc(); val tx=TransactionTemplate(DataSourceTransactionManager(requireNotNull(runtime.dataSource)))
        return JdbcNotificationPersistence(runtime,tx,mapper,Clock.fixed(now().plusSeconds(1),ZoneOffset.UTC),JdbcNotificationEmailProjection(runtime,NotificationEmailReadinessPort { NotificationEmailReadiness.READY }))
    }
    private fun event(episode: String=UUID.randomUUID().toString(),delivery: UUID=UUID.randomUUID())=requireNotNull(NotificationSourceEvent.create(
        requireNotNull(NotificationDeliveryId.fromWire(delivery)),requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.STORECORE_FACT,requireNotNull(NotificationSourceId.fromWire("email-source")))),
        NotificationCategory.STOCK,NotificationSeverity.WARNING,requireNotNull(NotificationConditionCode.fromWire("LOW_STOCK")),requireNotNull(NotificationEpisodeKey.fromWire(episode))))
    private fun alert(producer: NotificationPersistencePort=readyProducer(),event: NotificationSourceEvent=event())=(producer.ingest(event) as NotificationIngestionResult.Recorded).alert
    private fun state(intent: UUID)=NotificationEmailDeliveryState.fromWire(jdbc.queryForObject("SELECT state FROM notification_email_delivery WHERE intent_id=?",String::class.java,intent))
    private fun consent(): Session=provision().also { verify(it.userId); assertEquals(200,command(it,enable()).statusCode.value()) }

    @Test fun `self preferences require current verified USER binding and disable remains available after email changes`() {
        val owner=provision(); val key=UUID.randomUUID()
        val rejected=command(owner,enable(),key)
        assertEquals(409,rejected.statusCode.value(),rejected.body); assertEquals("EMAIL_UNVERIFIED",data(rejected).path("outcome").textValue())
        verify(owner.userId)
        assertEquals(data(rejected),data(command(owner,enable(),key)))
        val enabled=command(owner,enable()); assertEquals(200,enabled.statusCode.value(),enabled.body)
        val view=request(preferencePath,HttpMethod.GET,session=owner)
        assertEquals("UNCONFIGURED",data(view).path("readiness").textValue()); assertTrue(data(view).path("verified").asBoolean())
        assertEquals("no-store",view.headers.cacheControl); assertFalse(view.body!!.contains(owner.email)); assertFalse(view.body!!.contains("emailDigest"))
        jdbc.update("UPDATE users SET email=? WHERE id=?","changed-${UUID.randomUUID()}@example.test",owner.userId)
        val changed=data(request(preferencePath,HttpMethod.GET,session=owner))
        assertEquals("INVALIDATED",changed.path("preference").path("state").textValue()); assertFalse(changed.path("verified").asBoolean())
        val disabled=command(owner,disable(2)); assertEquals(200,disabled.statusCode.value(),disabled.body)
        assertEquals("DISABLED",data(disabled).path("preference").path("state").textValue())
        assertEquals(3L,jdbc.queryForObject("SELECT revision FROM notification_email_preferences WHERE user_id=?",Long::class.java,owner.userId))
        assertEquals(401,request(preferencePath,HttpMethod.GET).statusCode.value())
    }

    @Test fun `HTTP self only origin csrf strict fields and global UUID scope cannot be bypassed`() {
        val owner=consent(); val key=UUID.randomUUID(); val first=command(owner,disable(1),key)
        assertEquals(200,first.statusCode.value()); assertEquals(data(first),data(command(owner,disable(1),key)))
        val other=provision(); verify(other.userId)
        assertEquals(409,command(other,disable(0),key).statusCode.value())
        val before=jdbc.queryForObject("SELECT count(*) FROM notification_email_preference_receipts",Long::class.java)
        listOf(enable(2).dropLast(1)+",\"userId\":${other.userId}}",enable(2).replace("STOCK","CAMPAIGN"),enable(2).replace("WARNING","INFO"),enable(2).replace("\"2\"","2")).forEach {
            assertEquals(400,command(owner,it).statusCode.value())
        }
        assertEquals(403,request("$preferencePath/commands",HttpMethod.POST,enable(2),owner,UUID.randomUUID(),origin="https://evil.example").statusCode.value())
        assertEquals(403,request("$preferencePath/commands",HttpMethod.POST,enable(2),owner,UUID.randomUUID(),csrf=null).statusCode.value())
        assertEquals(415,request("$preferencePath/commands",HttpMethod.POST,enable(2),owner,UUID.randomUUID(),media=MediaType.TEXT_PLAIN).statusCode.value())
        assertEquals(before,jdbc.queryForObject("SELECT count(*) FROM notification_email_preference_receipts",Long::class.java))
        val admin=provision(InternalRole.ADMIN); val alert=alert(persistence)
        val cross=request("/api/v1/user/notifications/${alert.id.value}/commands",HttpMethod.POST,"""{"operation":"RESOLVE","expectedRevision":"0","reason":"Reviewed"}""",admin,key)
        assertEquals(409,cross.statusCode.value(),cross.body); cross.headers.getFirst("X-CSRF-Token")?.let { admin.csrf=it }
        val lifecycleKey=UUID.randomUUID()
        val lifecycle=request("/api/v1/user/notifications/${alert.id.value}/commands",HttpMethod.POST,"""{"operation":"RESOLVE","expectedRevision":"0","reason":"Reviewed"}""",admin,lifecycleKey)
        assertEquals(200,lifecycle.statusCode.value(),lifecycle.body); admin.csrf=lifecycle.headers.getFirst("X-CSRF-Token")!!
        assertEquals(409,command(admin,disable(0),lifecycleKey).statusCode.value())
    }

    @Test fun `production stays unconfigured and READY projects only first new eligible episodes without plaintext or backfill`() {
        val owner=consent(); assertEquals(NotificationEmailReadiness.UNCONFIGURED,readiness.current())
        val old=event(); val original=alert(persistence,old)
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM notification_email_outbox WHERE alert_id=?",Int::class.java,original.id.value))
        val ready=readyProducer(); alert(ready,event(old.episode.value))
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM notification_email_outbox WHERE alert_id=?",Int::class.java,original.id.value))
        val source=event(); val fresh=alert(ready,source); alert(ready,source); alert(ready,event(source.episode.value))
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM notification_email_outbox WHERE alert_id=? AND user_id=?",Int::class.java,fresh.id.value,owner.userId))
        val stored=jdbc.queryForObject("SELECT row_to_json(o)::text FROM notification_email_outbox o WHERE alert_id=?",String::class.java,fresh.id.value)!!
        assertFalse(stored.contains(owner.email)); assertFalse(stored.contains("destination"))
        assertEquals(200,command(owner,disable(1)).statusCode.value())
        assertEquals(200,command(owner,enable(2)).statusCode.value())
        alert(ready,event(source.episode.value))
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM notification_email_outbox WHERE alert_id=?",Int::class.java,fresh.id.value))
        assertEquals(NotificationLifecycle.OPEN,persistence.find(fresh.id)!!.lifecycle)
        assertEquals(0L,persistence.find(fresh.id)!!.revision.value)
    }

    @Test fun `worker fake transport uses durable handoff generic template and settles without changing alerts`() {
        val owner=consent(); val alert=alert(); val calls=AtomicInteger(); val queue=queue()
        val worker=NotificationEmailWorker(queue,NotificationEmailReadinessPort { NotificationEmailReadiness.READY },NotificationEmailTransport { destination,message ->
            calls.incrementAndGet(); assertEquals(owner.email,destination.value)
            assertTrue(jdbc.queryForObject("SELECT handoff_started_at IS NOT NULL FROM notification_email_delivery d JOIN notification_email_outbox o ON o.id=d.intent_id WHERE o.alert_id=?",Boolean::class.java,alert.id.value)!!)
            assertFalse(message.body.contains("email-source")); assertFalse(message.body.contains(owner.email)); assertTrue(message.body.endsWith("https://merchant.example.test/user/notifications"))
            NotificationEmailTransportResult.Sent
        },requireNotNull(NotificationEmailCenterLink.fromOrigin("https://merchant.example.test")))
        val result=worker.run(UUID.randomUUID()) as NotificationEmailWorkerResult.Settled
        assertEquals(NotificationEmailDeliveryState.SENT,result.state); assertEquals(1,calls.get())
        assertEquals(NotificationLifecycle.OPEN,persistence.find(alert.id)!!.lifecycle); assertEquals(0L,persistence.find(alert.id)!!.revision.value)
        assertSame(NotificationEmailWorkerResult.Skipped,worker.run(UUID.randomUUID()))
    }

    @Test fun `handoff is committed before fake transport even inside a caller transaction that rolls back`() {
        consent(); val alert=alert(); val sharedQueue=JdbcNotificationEmailQueue(jdbc,transactions)
        val separate=JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password))
        val calls=AtomicInteger()
        val worker=NotificationEmailWorker(sharedQueue,NotificationEmailReadinessPort { NotificationEmailReadiness.READY },NotificationEmailTransport { _,_->
            calls.incrementAndGet()
            assertTrue(separate.queryForObject("SELECT handoff_started_at IS NOT NULL FROM notification_email_delivery d JOIN notification_email_outbox o ON o.id=d.intent_id WHERE o.alert_id=?",Boolean::class.java,alert.id.value)!!)
            NotificationEmailTransportResult.Sent
        },requireNotNull(NotificationEmailCenterLink.fromOrigin("https://merchant.example.test")))
        assertThrows(IllegalStateException::class.java) {
            transactions.executeWithoutResult {
                assertEquals(NotificationEmailDeliveryState.SENT,(worker.run(UUID.randomUUID()) as NotificationEmailWorkerResult.Settled).state)
                error("caller rollback cannot undo already durable handoff")
            }
        }
        assertEquals(1,calls.get())
        assertEquals("SENT",jdbc.queryForObject("SELECT state FROM notification_email_delivery d JOIN notification_email_outbox o ON o.id=d.intent_id WHERE o.alert_id=?",String::class.java,alert.id.value))
    }

    @Test fun `lease lost after handoff and unclassified transport exception become uncertain with no retry`() {
        consent(); val alert=alert(); val queue=queue(); val owner=UUID.randomUUID(); val now=now()
        val lease=queue.acquire(owner,now)!!; assertNotNull(queue.beginHandoff(lease,now))
        assertFalse(queue.settle(lease,NotificationEmailSettlement(NotificationEmailDeliveryState.SENT,null),lease.expiresAt.plusSeconds(1)))
        assertEquals(1,queue.reap(lease.expiresAt.plusSeconds(1)))
        assertEquals(NotificationEmailDeliveryState.UNCERTAIN,state(lease.intentId)); assertNull(queue.acquire(UUID.randomUUID(),lease.expiresAt.plusSeconds(600)))
        assertEquals(0L,persistence.find(alert.id)!!.revision.value)
        val second=alert(); val worker=NotificationEmailWorker(queue,NotificationEmailReadinessPort { NotificationEmailReadiness.READY },NotificationEmailTransport { _,_-> throw IllegalStateException("unclassified") },requireNotNull(NotificationEmailCenterLink.fromOrigin("https://merchant.example.test")))
        assertEquals(NotificationEmailDeliveryState.UNCERTAIN,(worker.run(UUID.randomUUID()) as NotificationEmailWorkerResult.Settled).state)
        assertEquals(NotificationLifecycle.OPEN,persistence.find(second.id)!!.lifecycle)
    }

    @Test fun `unconfigured worker never claims and TTL or unstarted lease expiry cannot send stale work`() {
        consent(); val alert=alert(); val queue=queue(); val intent=jdbc.queryForObject("SELECT id FROM notification_email_outbox WHERE alert_id=?",UUID::class.java,alert.id.value)!!
        val worker=NotificationEmailWorker(queue,NotificationEmailReadinessPort { NotificationEmailReadiness.UNCONFIGURED },NotificationEmailTransport { _,_-> error("transport must remain inactive") },requireNotNull(NotificationEmailCenterLink.fromOrigin("https://merchant.example.test")))
        assertSame(NotificationEmailWorkerResult.Skipped,worker.run(UUID.randomUUID())); assertEquals(NotificationEmailDeliveryState.PENDING,state(intent))
        val first=queue.acquire(UUID.randomUUID(),now())!!
        val afterLease=first.expiresAt.plusSeconds(1); assertEquals(1,queue.reap(afterLease)); assertEquals(NotificationEmailDeliveryState.RETRY,state(intent))
        val second=queue.acquire(UUID.randomUUID(),afterLease.plusSeconds(31))!!
        assertEquals(2,second.attempt); assertNull(queue.beginHandoff(first,now()))
        assertEquals(1,queue.reap(now().plus(Duration.ofHours(25)))); assertEquals(NotificationEmailDeliveryState.CANCELLED,state(intent))
        assertNull(queue.beginHandoff(second,now())); assertEquals(0L,persistence.find(alert.id)!!.revision.value)
    }

    @Test fun `pre DATA retry max attempts fencing opt out email and role loss are revalidated`() {
        val owner=consent(); val queue=queue(); alert(); var at=now()
        for(attempt in 1..5) {
            val lease=queue.acquire(UUID.randomUUID(),at)!!; assertEquals(attempt,lease.attempt)
            assertNull(queue.beginHandoff(NotificationEmailLease(lease.intentId,UUID.randomUUID(),lease.attempt,lease.expiresAt,lease.template),at))
            assertNotNull(queue.beginHandoff(lease,at))
            val settlement=NotificationEmailRetryPolicy().settle(NotificationEmailTransportResult.ProvenPreDataFailure,attempt,at)
            assertTrue(queue.settle(lease,settlement,at)); assertFalse(queue.settle(lease,settlement,at))
            assertEquals(if(attempt==5) NotificationEmailDeliveryState.DEAD else NotificationEmailDeliveryState.RETRY,state(lease.intentId))
            at=settlement.retryAt?.plusSeconds(1) ?: at
        }
        val fresh=alert(); val lease=queue.acquire(UUID.randomUUID(),now())!!
        assertEquals(200,command(owner,disable(1)).statusCode.value())
        assertNull(queue.beginHandoff(lease,now())); assertEquals(NotificationEmailDeliveryState.CANCELLED,state(lease.intentId))
        assertEquals(200,command(owner,enable(2)).statusCode.value()); alert()
        val address=queue.acquire(UUID.randomUUID(),now())!!
        jdbc.update("UPDATE users SET email=? WHERE id=?","different-${UUID.randomUUID()}@example.test",owner.userId)
        assertNull(queue.beginHandoff(address,now())); assertEquals(NotificationEmailDeliveryState.CANCELLED,state(address.intentId))
        verify(owner.userId); assertEquals(200,command(owner,enable(4)).statusCode.value()); alert()
        val roles=queue.acquire(UUID.randomUUID(),now())!!
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",owner.userId)
        assertNull(queue.beginHandoff(roles,now())); assertEquals(NotificationEmailDeliveryState.CANCELLED,state(roles.intentId))
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='OPERATOR'",owner.userId)
        assertEquals("INVALIDATED",data(request(preferencePath,HttpMethod.GET,session=owner)).path("preference").path("state").textValue())
        assertEquals(200,command(owner,enable(6)).statusCode.value()); alert()
        val inactive=queue.acquire(UUID.randomUUID(),now())!!
        jdbc.update("UPDATE users SET active=false WHERE id=?",owner.userId)
        assertNull(queue.beginHandoff(inactive,now())); assertEquals(NotificationEmailDeliveryState.CANCELLED,state(inactive.intentId))
        jdbc.update("UPDATE users SET active=true WHERE id=?",owner.userId)
        assertEquals("INVALIDATED",data(request(preferencePath,HttpMethod.GET,session=owner)).path("preference").path("state").textValue())
        assertEquals(0L,persistence.find(fresh.id)!!.revision.value)
    }

    @Test fun `projection and preference audit failures roll back atomically and V34 upgrade is least privileged`() {
        val owner=consent(); val count=jdbc.queryForObject("SELECT count(*) FROM notification_alerts",Long::class.java)
        val failing=JdbcNotificationPersistence(jdbc,transactions,mapper,emailProjection=NotificationEmailIntentProjection { error("projection failure") })
        assertThrows(IllegalStateException::class.java) { alert(failing) }; assertEquals(count,jdbc.queryForObject("SELECT count(*) FROM notification_alerts",Long::class.java))
        jdbc.execute("CREATE FUNCTION notification_email_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'} BEGIN RAISE EXCEPTION 'fixture'; END ${'$'}${'$'}")
        jdbc.execute("CREATE TRIGGER notification_email_fixture_audit BEFORE INSERT ON notification_email_preference_audit FOR EACH ROW EXECUTE FUNCTION notification_email_fixture_fail()")
        try {
            val key=UUID.randomUUID(); assertEquals(503,command(owner,disable(1),key).statusCode.value())
            assertEquals(1L,jdbc.queryForObject("SELECT revision FROM notification_email_preferences WHERE user_id=?",Long::class.java,owner.userId))
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM notification_command_bindings WHERE command_id=?",Int::class.java,key))
        } finally { jdbc.execute("DROP TRIGGER notification_email_fixture_audit ON notification_email_preference_audit"); jdbc.execute("DROP FUNCTION notification_email_fixture_fail()") }
        jdbc.execute("CREATE DATABASE notification_email_upgrade")
        val url=postgres.jdbcUrl.substringBeforeLast('/')+"/notification_email_upgrade"
        fun flyway(target: String?=null)=Flyway.configure().dataSource(url,postgres.username,postgres.password).locations("classpath:db/migration").apply { if(target!=null) target(target) }.load()
        flyway("34").migrate(); val upgraded=JdbcTemplate(DriverManagerDataSource(url,postgres.username,postgres.password))
        val historicalActor=upgraded.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES ('historical@example.test',?,'Historical','Fixture') RETURNING id",Long::class.java,"${'$'}argon2id${'$'}fixture")!!
        val historical=requireNotNull(NotificationAlert.open(requireNotNull(NotificationId.fromWire(UUID.randomUUID())),
            requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.STORECORE_FACT,requireNotNull(NotificationSourceId.fromWire("historical")))),
            NotificationCategory.STOCK,NotificationSeverity.WARNING,requireNotNull(NotificationConditionCode.fromWire("LOW_STOCK")),requireNotNull(NotificationEpisodeKey.fromWire("historical-episode"))))
        upgraded.update("INSERT INTO notification_alerts VALUES (?,?,?,?,?,?,'OPEN',0,clock_timestamp())",historical.id.value,historical.source.type.wire,historical.source.id.value,historical.fingerprint.value,historical.category.wire,historical.severity.wire)
        val historicalCommand=requireNotNull(NotificationCommand.ChangeLifecycle.create(requireNotNull(NotificationCommandId.fromWire(UUID.randomUUID())),historical.id,
            requireNotNull(NotificationActorId.fromWire(historicalActor)),historical.revision,NotificationTransitionStep.Resolve,requireNotNull(NotificationReason.fromWire("Historical")),Instant.now()))
        upgraded.update("UPDATE notification_alerts SET lifecycle='RESOLVED',revision=1 WHERE id=?",historical.id.value)
        upgraded.update("INSERT INTO notification_command_receipts VALUES (?,?,?,'RESOLVE',0,'Historical',?,'APPLIED',?::jsonb,?)",historicalCommand.id.value,historical.id.value,historicalActor,historicalCommand.payloadHash().value,NotificationSnapshotCodec(mapper).encode(historical),Timestamp.from(historicalCommand.occurredAt))
        upgraded.update("INSERT INTO notification_lifecycle_audit VALUES (?)",historicalCommand.id.value)
        val before=upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("45",flyway().migrate().targetSchemaVersion.toString()); assertEquals(before,upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=34 ORDER BY installed_rank"))
        assertEquals("LIFECYCLE",upgraded.queryForObject("SELECT family FROM notification_command_bindings WHERE command_id=?",String::class.java,historicalCommand.id.value))
        assertEquals(historicalCommand.payloadHash().value,upgraded.queryForObject("SELECT payload_hash FROM notification_command_bindings WHERE command_id=?",String::class.java,historicalCommand.id.value))
        listOf(jdbc,upgraded).forEach { database ->
            listOf("notification_command_bindings","notification_email_preference_receipts","notification_email_preference_audit","notification_email_outbox","notification_email_delivery_evidence").forEach { table ->
                assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'DELETE')",Boolean::class.java,table)!!)
                assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'UPDATE')",Boolean::class.java,table)!!)
            }
            assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime','users','SELECT')",Boolean::class.java)!!)
        }
        flyway().validate()
    }
}
