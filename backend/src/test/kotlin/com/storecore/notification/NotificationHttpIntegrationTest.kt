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
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
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
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties=["storecore.installation-guard.enabled=false","storecore.inventory.expiry-delay-ms=3600000"])
class NotificationHttpIntegrationTest @Autowired constructor(private val http: TestRestTemplate,private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,private val passwords: Argon2PasswordHasher,private val transactions: TransactionTemplate,
    private val persistence: NotificationPersistencePort,@LocalServerPort private val port: Int) {
    companion object {
        private val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start(); registry.add("spring.datasource.url") { postgres.jdbcUrl }; registry.add("spring.datasource.username") { postgres.username }; registry.add("spring.datasource.password") { postgres.password }
        }
    }
    private data class Session(val cookie: String,val userId: Long,val sessionId: UUID,val role: InternalRole,var csrf: String) {
        fun principal()=InternalUserPrincipal(sessionId,userId,setOf(role))
    }
    private fun provision(role: InternalRole=InternalRole.ADMIN): Session {
        val email="notification-${UUID.randomUUID()}@example.test"
        val id=jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Notification','HTTP') RETURNING id",Long::class.java,email,passwords.hash("notification-fixture-password".toCharArray()))!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role.name)
        val login=exchange("/api/v1/internal/auth/login",HttpMethod.POST,"""{"email":"$email","password":"notification-fixture-password"}""")
        assertEquals(200,login.statusCode.value(),login.body)
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'),id,jdbc.queryForObject("SELECT id FROM identity_sessions WHERE user_id=? AND revoked_at IS NULL",UUID::class.java,id)!!,role,login.headers.getFirst("X-CSRF-Token")!!)
    }
    private fun alert(category: NotificationCategory=NotificationCategory.STOCK,severity: NotificationSeverity=NotificationSeverity.WARNING,
                      source: NotificationSourceType=NotificationSourceType.STORECORE_FACT,at: Instant?=null): NotificationAlert {
        val event=requireNotNull(NotificationSourceEvent.create(requireNotNull(NotificationDeliveryId.fromWire(UUID.randomUUID())),
            requireNotNull(NotificationSourceIdentity.create(source,requireNotNull(NotificationSourceId.fromWire("source-${UUID.randomUUID()}")))),
            category,severity,requireNotNull(NotificationConditionCode.fromWire("CONDITION")),requireNotNull(NotificationEpisodeKey.fromWire(UUID.randomUUID().toString()))))
        val producer=if(at==null) persistence else JdbcNotificationPersistence(jdbc,transactions,mapper,Clock.fixed(at,ZoneOffset.UTC))
        return (producer.ingest(event) as NotificationIngestionResult.Recorded).alert
    }
    private fun path(alert: NotificationAlert)="/api/v1/user/notifications/${alert.id.value}"
    private fun body(operation: String="RESOLVE",revision: String="0",reason: String="Reviewed")="""{"operation":"$operation","expectedRevision":"$revision","reason":"$reason"}"""
    private fun command(alert: NotificationAlert,session: Session,key: UUID=UUID.randomUUID(),body: String=body()): ResponseEntity<String> =
        exchange(path(alert)+"/commands",HttpMethod.POST,body,session,key=key.toString()).also { it.headers.getFirst("X-CSRF-Token")?.let { token -> session.csrf=token } }
    private fun data(response: ResponseEntity<String>): JsonNode = mapper.readTree(response.body!!).path("data")
    private fun exchange(path: String,method: HttpMethod,body: String?=null,session: Session?=null,key: String?=null,
                         origin: String?="http://localhost:4200",csrf: String?=session?.csrf,media: MediaType=MediaType.APPLICATION_JSON): ResponseEntity<String> =
        http.exchange(URI("http://localhost:$port$path"),method,HttpEntity(body,HttpHeaders().apply {
            contentType=media; if(origin!=null) set(HttpHeaders.ORIGIN,origin); if(session!=null) set(HttpHeaders.COOKIE,session.cookie)
            if(csrf!=null) set("X-CSRF-Token",csrf); if(key!=null) set("Idempotency-Key",key)
        }),String::class.java)
    private fun runtimeQueries(): JdbcNotificationQueries {
        val source=object : DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password) {
            override fun getConnection(): Connection=super.getConnection().also { it.createStatement().use { statement -> statement.execute("SET ROLE storecore_runtime") } }
        }
        return JdbcNotificationQueries(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),mapper)
    }

    @Test fun `real HTTP reads enforce realms and roles with bounded stable pagination and closed filters`() {
        val admin=provision(); val operator=provision(InternalRole.OPERATOR)
        val records=(1..3).map { alert(NotificationCategory.CAMPAIGN,NotificationSeverity.CRITICAL,NotificationSourceType.SYSTEM_CAMPAIGN,Instant.parse("2100-01-01T00:00:00Z")) }
        val query="/api/v1/user/notifications?category=CAMPAIGN&severity=CRITICAL&source=SYSTEM_CAMPAIGN&lifecycle=OPEN&size=2"
        val first=exchange(query,HttpMethod.GET,session=operator)
        assertEquals(200,first.statusCode.value(),first.body); assertEquals("no-store",first.headers.cacheControl)
        assertEquals(3,data(first).path("total").asInt()); assertEquals(2,data(first).path("items").size()); assertTrue(data(first).path("hasMore").asBoolean())
        val sorted=records.map { it.id.value.toString() }.sorted()
        assertEquals(sorted.take(2),data(first).path("items").map { it.path("notification").path("id").asText() })
        assertTrue(data(first).path("items").all { it.path("availableOperations").isEmpty })
        val second=exchange(query+"&page=1",HttpMethod.GET,session=admin)
        assertEquals(sorted.drop(2),data(second).path("items").map { it.path("notification").path("id").asText() }); assertFalse(data(second).path("hasMore").asBoolean())
        val beyond=exchange(query+"&page=2147483647",HttpMethod.GET,session=admin)
        assertEquals(3,data(beyond).path("total").asInt()); assertTrue(data(beyond).path("items").isEmpty)
        val detail=exchange(path(records.first()),HttpMethod.GET,session=operator)
        assertEquals(200,detail.statusCode.value()); assertTrue(data(detail).path("notification").path("revision").isTextual)
        assertFalse(detail.body!!.contains("actorId")); assertFalse(detail.body!!.contains("reason"))
        assertEquals(401,exchange(query,HttpMethod.GET).statusCode.value())
        val customer=exchange("/api/v1/customer/auth/register",HttpMethod.POST,"""{"email":"customer-${UUID.randomUUID()}@example.test","password":"notification-fixture-password","firstName":"Customer","lastName":"Fixture"}""")
        assertEquals(201,customer.statusCode.value(),customer.body)
        val customerRead=http.exchange(URI("http://localhost:$port/api/v1/user/notifications"),HttpMethod.GET,
            HttpEntity<String>(HttpHeaders().apply { set(HttpHeaders.COOKIE,customer.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')) }),String::class.java)
        assertEquals(401,customerRead.statusCode.value()); assertEquals("no-store",customerRead.headers.cacheControl)
        listOf("severity=UNKNOWN","category=future","source=","page=-1","size=101","page=0&page=1").forEach {
            val response=exchange("/api/v1/user/notifications?$it",HttpMethod.GET,session=admin)
            assertEquals(400,response.statusCode.value(),response.body); assertEquals("no-store",response.headers.cacheControl)
        }
        assertEquals(404,exchange("/api/v1/user/notifications/${UUID.randomUUID()}",HttpMethod.GET,session=operator).statusCode.value())
    }

    @Test fun `commands rotate csrf on business rejection and exact replay while private lookup is uniformly not found`() {
        val admin=provision(); val other=provision(); val operator=provision(InternalRole.OPERATOR); val alert=alert(); val key=UUID.randomUUID()
        val first=command(alert,admin,key)
        assertEquals(200,first.statusCode.value(),first.body); assertNotNull(first.headers.getFirst("X-CSRF-Token")); assertEquals("APPLIED",data(first).path("outcome").asText())
        val resolved=persistence.find(alert.id)!!
        assertEquals(200,command(resolved,admin,body=body("REOPEN","1")).statusCode.value())
        val replay=command(alert,admin,key)
        assertEquals(200,replay.statusCode.value()); assertEquals(data(first),data(replay)); assertEquals(2L,persistence.find(alert.id)!!.revision.value)
        val rejectedKey=UUID.randomUUID(); val rejected=command(alert,admin,rejectedKey,body("REOPEN","2"))
        assertEquals(409,rejected.statusCode.value()); assertEquals("INVALID_TRANSITION",data(rejected).path("outcome").asText()); assertNotNull(rejected.headers.getFirst("X-CSRF-Token"))
        assertEquals(data(rejected),data(command(alert,admin,rejectedKey,body("REOPEN","2"))))
        val conflict=command(alert,admin,key,body(reason="Different")); assertEquals(409,conflict.statusCode.value()); assertTrue(data(conflict).isNull)
        val lookup=path(alert)+"/commands/$key"
        assertEquals(data(first),data(exchange(lookup,HttpMethod.GET,session=admin)))
        val foreign=exchange(lookup,HttpMethod.GET,session=other)
        val absent=exchange(path(alert)+"/commands/${UUID.randomUUID()}",HttpMethod.GET,session=other)
        val foreignAggregate=exchange(path(alert())+"/commands/$key",HttpMethod.GET,session=admin)
        val missingAggregate=exchange("/api/v1/user/notifications/${UUID.randomUUID()}/commands/$key",HttpMethod.GET,session=admin)
        listOf(foreign,absent,foreignAggregate,missingAggregate).forEach { assertEquals(404,it.statusCode.value()); assertEquals("no-store",it.headers.cacheControl); assertEquals(mapper.readTree(foreign.body),mapper.readTree(it.body)) }
        assertEquals(403,exchange(lookup,HttpMethod.GET,session=operator).statusCode.value())
        assertEquals(403,command(alert,operator).statusCode.value())
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM notification_command_receipts WHERE alert_id=?",Int::class.java,alert.id.value))
    }

    @Test fun `strict JSON origin csrf media and UUID gates reject before receipt creation`() {
        val admin=provision(); val alert=alert(); val route=path(alert)+"/commands"
        listOf(body().dropLast(1)+",\"actorId\":1}",body().dropLast(1)+",\"operation\":\"RESOLVE\"}",body()+"{}",body().replace("\"0\"","0"),body(revision="00"),body(operation="UNKNOWN")).forEach {
            val response=exchange(route,HttpMethod.POST,it,admin,UUID.randomUUID().toString())
            assertEquals(400,response.statusCode.value(),response.body); assertEquals("no-store",response.headers.cacheControl)
        }
        assertEquals(400,exchange(route,HttpMethod.POST,body(),admin).statusCode.value())
        assertEquals(400,exchange(route,HttpMethod.POST,body(),admin,UUID(0,0).toString()).statusCode.value())
        assertEquals(403,exchange(route,HttpMethod.POST,body(),admin,UUID.randomUUID().toString(),origin="https://evil.example").statusCode.value())
        assertEquals(403,exchange(route,HttpMethod.POST,body(),admin,UUID.randomUUID().toString(),csrf=null).statusCode.value())
        assertEquals(403,exchange(route,HttpMethod.POST,body(),admin,UUID.randomUUID().toString(),csrf="invalid").statusCode.value())
        val media=exchange(route,HttpMethod.POST,body(),admin,UUID.randomUUID().toString(),media=MediaType.TEXT_PLAIN)
        assertEquals(415,media.statusCode.value()); assertEquals("no-store",media.headers.cacheControl)
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM notification_command_receipts WHERE alert_id=?",Int::class.java,alert.id.value))
        assertEquals(0L,persistence.find(alert.id)!!.revision.value)
        assertEquals(404,exchange("/api/v1/user/notifications/${UUID.randomUUID()}/commands",HttpMethod.POST,body(),admin,UUID.randomUUID().toString()).statusCode.value())
    }

    @Test fun `runtime query repository enforces live role changes revocation and receipt ownership without identity grants`() {
        val queries=runtimeQueries(); val admin=provision(); val other=provision(); val operator=provision(InternalRole.OPERATOR); val alert=alert(); val key=UUID.randomUUID()
        assertEquals(200,command(alert,admin,key).statusCode.value())
        assertInstanceOf(NotificationQueryResult.Found::class.java,queries.detail(operator.principal(),alert.id))
        assertSame(NotificationQueryResult.Missing,queries.receipt(other.principal(),alert.id,requireNotNull(NotificationCommandId.fromWire(key))))
        assertSame(NotificationQueryResult.Unauthorized,queries.receipt(operator.principal(),alert.id,requireNotNull(NotificationCommandId.fromWire(key))))
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','users','SELECT')",Boolean::class.java)!!)
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",admin.userId)
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='OPERATOR'",admin.userId)
        assertFalse((queries.detail(admin.principal(),alert.id) as NotificationQueryResult.Found<NotificationReadAlert>).value.mayTransition)
        assertSame(NotificationQueryResult.Unauthorized,queries.receipt(admin.principal(),alert.id,requireNotNull(NotificationCommandId.fromWire(key))))
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",operator.userId)
        assertSame(NotificationQueryResult.Unauthorized,queries.list(operator.principal(),requireNotNull(NotificationInboxQuery.create())))
        jdbc.update("UPDATE identity_sessions SET revoked_at=clock_timestamp(),revocation_kind='SELF',revoked_by_user_id=?,revocation_correlation_id=?,revoked_reason='Fixture' WHERE id=?",other.userId,UUID.randomUUID(),other.sessionId)
        assertSame(NotificationQueryResult.Unauthorized,queries.detail(other.principal(),alert.id))
    }

    @Test fun `V33 upgrade grants only read guard execution and preserves published checksums`() {
        jdbc.execute("CREATE DATABASE notification_read_upgrade")
        val url=postgres.jdbcUrl.substringBeforeLast('/')+"/notification_read_upgrade"
        fun migration(target: String?=null)=Flyway.configure().dataSource(url,postgres.username,postgres.password).locations("classpath:db/migration").apply { if(target!=null) target(target) }.load()
        migration("33").migrate()
        val upgraded=JdbcTemplate(DriverManagerDataSource(url,postgres.username,postgres.password))
        val before=upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("34",migration().migrate().targetSchemaVersion.toString())
        assertEquals(before,upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=33 ORDER BY installed_rank"))
        listOf(jdbc,upgraded).forEach { database ->
            assertTrue(database.queryForObject("SELECT has_function_privilege('storecore_runtime','notification_read_authorized(bigint,uuid)','EXECUTE')",Boolean::class.java)!!)
            assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime','identity_sessions','SELECT')",Boolean::class.java)!!)
            assertEquals("storecore_migrator",database.queryForObject("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='notification_read_authorized(bigint,uuid)'::regprocedure",String::class.java))
        }
        migration().validate(); assertEquals(0,migration().migrate().migrationsExecuted)
    }

    @Test fun `maximum revision stays a string and persisted future data returns unavailable without effects`() {
        val admin=provision(); val original=alert(); val maxId=UUID.randomUUID()
        jdbc.update("INSERT INTO notification_alerts SELECT ?,source_type,source_id,?,category,severity,lifecycle,9223372036854775807,created_at FROM notification_alerts WHERE id=?",maxId,"f".repeat(64),original.id.value)
        val max=persistence.find(requireNotNull(NotificationId.fromWire(maxId)))!!
        val read=exchange(path(max),HttpMethod.GET,session=admin)
        assertEquals("9223372036854775807",data(read).path("notification").path("revision").textValue())
        val rejected=command(max,admin,body=body(revision="9223372036854775807"))
        assertEquals(409,rejected.statusCode.value()); assertEquals("REVISION_EXHAUSTED",data(rejected).path("outcome").textValue())
        jdbc.execute("ALTER TABLE notification_alerts DROP CONSTRAINT notification_alerts_lifecycle_check")
        jdbc.execute("ALTER TABLE notification_alerts DISABLE TRIGGER trg_notification_projection")
        try {
            jdbc.update("UPDATE notification_alerts SET lifecycle='FUTURE' WHERE id=?",original.id.value)
            val unavailable=exchange(path(original),HttpMethod.GET,session=admin)
            assertEquals(503,unavailable.statusCode.value()); assertEquals("no-store",unavailable.headers.cacheControl)
            assertFalse(unavailable.body!!.contains("FUTURE"))
            val key=UUID.randomUUID(); val failed=command(original,admin,key)
            assertEquals(503,failed.statusCode.value(),failed.body)
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM notification_command_receipts WHERE command_id=?",Int::class.java,key))
        } finally {
            jdbc.update("UPDATE notification_alerts SET lifecycle='OPEN' WHERE id=?",original.id.value)
            jdbc.execute("ALTER TABLE notification_alerts ENABLE TRIGGER trg_notification_projection")
            jdbc.execute("ALTER TABLE notification_alerts ADD CONSTRAINT notification_alerts_lifecycle_check CHECK(lifecycle IN ('OPEN','ACKNOWLEDGED','RESOLVED'))")
        }
        assertEquals(200,command(original,admin).statusCode.value())
    }

    @Test fun `read authorization expires safely while queued on role membership lock`() {
        val owner=provision(InternalRole.OPERATOR); val session=UUID.randomUUID(); val queries=runtimeQueries(); val alert=alert()
        jdbc.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '3 seconds',clock_timestamp()+interval '2 hours')""",
            session,owner.userId,UUID.randomUUID().toString().replace("-","").repeat(2))
        val principal=owner.principal().copy(sessionId=session); val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false
            blocker.prepareStatement("SELECT user_id FROM user_roles WHERE user_id=? FOR UPDATE").use { it.setLong(1,owner.userId); it.execute() }
            val future=pool.submit<NotificationQueryResult<NotificationReadAlert>> { queries.detail(principal,alert.id) }
            try {
                awaitDatabase { jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT notification_read_authorized%')",Boolean::class.java)!! }
                awaitDatabase { jdbc.queryForObject("SELECT idle_expires_at<clock_timestamp() FROM identity_sessions WHERE id=?",Boolean::class.java,session)!! }
                blocker.commit()
                assertSame(NotificationQueryResult.Unauthorized,future.get(10,TimeUnit.SECONDS))
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
    }
    private fun awaitDatabase(condition: () -> Boolean) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        while(!condition()) { check(System.nanoTime()<deadline) { "Database condition timed out" }; Thread.sleep(20) }
    }
}
