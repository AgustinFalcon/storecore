package com.storecore.notification

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.identity.domain.*
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import com.storecore.notification.infrastructure.*
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.Timestamp
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class NotificationPersistencePostgresTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @BeforeAll fun start() {
            postgres.start()
            flyway().migrate()
        }
        private fun flyway(target: String? = null, url: String = postgres.jdbcUrl) = Flyway.configure()
            .dataSource(url,postgres.username,postgres.password).locations("classpath:db/migration")
            .apply { if(target!=null) target(target) }.load()
        @JvmStatic @AfterAll fun stop() = postgres.stop()
    }
    private val root by lazy { JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password)) }
    private val fixedClock = Clock.fixed(Instant.parse("2026-11-24T12:00:00.123456Z"),ZoneOffset.UTC)
    private fun runtime() = object : DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password) {
        override fun getConnection(): Connection = super.getConnection().also { it.createStatement().use { statement -> statement.execute("SET ROLE storecore_runtime") } }
    }
    private fun repository(clock: Clock = fixedClock): JdbcNotificationPersistence {
        val source = runtime()
        return JdbcNotificationPersistence(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),jacksonObjectMapper(),clock)
    }
    private fun actor(role: InternalRole = InternalRole.ADMIN): InternalUserPrincipal {
        val id = root.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Notification','Fixture') RETURNING id",
            Long::class.java,"notification-${UUID.randomUUID()}@example.test","${'$'}argon2id${'$'}fixture")!!
        root.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role.name)
        val session = UUID.randomUUID()
        root.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",session,id,UUID.randomUUID().toString().replace("-", "").repeat(2))
        return InternalUserPrincipal(session,id,setOf(role))
    }
    private fun event(delivery: UUID = UUID.randomUUID(), episode: String = UUID.randomUUID().toString(), severity: NotificationSeverity = NotificationSeverity.WARNING,
                      source: String = "stock-source"): NotificationSourceEvent = requireNotNull(NotificationSourceEvent.create(
        requireNotNull(NotificationDeliveryId.fromWire(delivery)),requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.STORECORE_FACT,requireNotNull(NotificationSourceId.fromWire(source)))),
        NotificationCategory.STOCK,severity,requireNotNull(NotificationConditionCode.fromWire("LOW_STOCK")),requireNotNull(NotificationEpisodeKey.fromWire(episode))))
    private fun ingest(repo: JdbcNotificationPersistence = repository(), source: NotificationSourceEvent = event()) =
        assertInstanceOf(NotificationIngestionResult.Recorded::class.java,repo.ingest(source)).alert
    private fun request(alert: NotificationAlert, step: NotificationTransitionStep = NotificationTransitionStep.Resolve,
                        id: UUID = UUID.randomUUID(), revision: Long = alert.revision.value, reason: String = "Reviewed") = NotificationLifecycleRequest(
        requireNotNull(NotificationCommandId.fromWire(id)),alert.id,requireNotNull(NotificationRevision.fromWire(revision)),step,requireNotNull(NotificationReason.fromWire(reason)))
    private fun recorded(result: NotificationExecutionResult) = assertInstanceOf(NotificationExecutionResult.Recorded::class.java,result).receipt
    private fun count(table: String) = root.queryForObject("SELECT count(*) FROM $table",Long::class.java)!!

    @Test fun `clean install and V32 upgrade preserve checksums and enforce domain constraints and least privileges`() {
        root.execute("CREATE DATABASE notification_upgrade")
        val upgradeUrl = postgres.jdbcUrl.substringBeforeLast('/') + "/notification_upgrade"
        flyway("32",upgradeUrl).migrate()
        val jdbc = JdbcTemplate(DriverManagerDataSource(upgradeUrl,postgres.username,postgres.password))
        val history = jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("34",flyway(url=upgradeUrl).migrate().targetSchemaVersion.toString())
        assertEquals(history,jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=32 ORDER BY installed_rank"))
        assertEquals(0,flyway(url=upgradeUrl).migrate().migrationsExecuted)
        flyway(url=upgradeUrl).validate()
        listOf(root,jdbc).forEach { database ->
          listOf("notification_source_events","notification_command_receipts","notification_lifecycle_audit").forEach { table ->
            assertTrue(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'SELECT,INSERT')",Boolean::class.java,table)!!)
            assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'UPDATE')",Boolean::class.java,table)!!)
            assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'DELETE')",Boolean::class.java,table)!!)
          }
          assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime','notification_alerts','DELETE')",Boolean::class.java)!!)
          assertTrue(database.queryForObject("SELECT has_column_privilege('storecore_runtime','notification_alerts','lifecycle','UPDATE')",Boolean::class.java)!!)
          assertFalse(database.queryForObject("SELECT has_column_privilege('storecore_runtime','notification_alerts','severity','UPDATE')",Boolean::class.java)!!)
        }
        val alert = ingest()
        assertThrows(DataAccessException::class.java) { root.update("UPDATE notification_alerts SET severity='INFO' WHERE id=?",alert.id.value) }
        assertThrows(DataAccessException::class.java) { root.update("UPDATE notification_alerts SET lifecycle='OPEN',revision=revision+1 WHERE id=?",alert.id.value) }
        assertThrows(DataAccessException::class.java) { root.update("DELETE FROM notification_alerts WHERE id=?",alert.id.value) }
        assertThrows(DataAccessException::class.java) { root.update("INSERT INTO notification_alerts SELECT ?,source_type,source_id,?,category,'UNKNOWN',lifecycle,revision,created_at FROM notification_alerts WHERE id=?",UUID.randomUUID(),"b".repeat(64),alert.id.value) }
        assertThrows(DataAccessException::class.java) { root.update("INSERT INTO notification_alerts SELECT ?,source_type,?, ?,category,severity,lifecycle,revision,created_at FROM notification_alerts WHERE id=?",UUID.randomUUID(),"é".repeat(65),"c".repeat(64),alert.id.value) }
        assertNull(NotificationSourceId.fromWire("bad\u0000id")); assertNull(NotificationReason.fromWire("bad\u0000reason"))
    }

    @Test fun `delivery replay conflicts and episode evidence preserve resolved projection and original severity`() {
        val repo=repository(); val admin=actor(); val event=event()
        val alert=ingest(repo,event)
        assertEquals(alert.id,ingest(repo,event).id)
        val resolved=recorded(repo.execute(admin,request(alert))).result as NotificationCommandResult.Applied
        val additional=event(episode=event.episode.value,severity=NotificationSeverity.CRITICAL)
        val result=ingest(repo,additional)
        assertEquals(alert.id,result.id); assertEquals(NotificationLifecycle.RESOLVED,result.lifecycle)
        assertEquals(NotificationSeverity.WARNING,result.severity); assertEquals(1L,result.revision.value)
        assertEquals(2,root.queryForObject("SELECT count(*) FROM notification_source_events WHERE alert_id=?",Int::class.java,alert.id.value))
        assertSame(NotificationIngestionResult.DeliveryConflict,repo.ingest(event(delivery=event.deliveryId.value,episode=event.episode.value,severity=NotificationSeverity.CRITICAL)))
        assertNotEquals(alert.id,ingest(repo,event()).id)
        assertEquals(resolved.alert.fingerprint,result.fingerprint)
        val runtimeJdbc=JdbcTemplate(runtime())
        assertThrows(DataAccessException::class.java) { runtimeJdbc.update("UPDATE notification_source_events SET severity='INFO' WHERE delivery_id=?",event.deliveryId.value) }
        assertThrows(DataAccessException::class.java) { root.update("DELETE FROM notification_source_events WHERE delivery_id=?",event.deliveryId.value) }
    }

    @Test fun `receipts preserve historical applied and rejected results after later changes and reauthorize every replay`() {
        val repo=repository(); val admin=actor(); val alert=ingest(repo)
        val resolve=request(alert); val first=recorded(repo.execute(admin,resolve))
        val resolved=(first.result as NotificationCommandResult.Applied).alert
        val invalid=request(resolved); val rejected=recorded(repo.execute(admin,invalid)); assertSame(NotificationCommandResult.InvalidTransition,rejected.result)
        val stale=request(resolved,NotificationTransitionStep.Reopen,revision=0); assertInstanceOf(NotificationCommandResult.RevisionConflict::class.java,recorded(repo.execute(admin,stale)).result)
        recorded(repo.execute(admin,request(resolved,NotificationTransitionStep.Reopen)))
        val replay=recorded(repository(Clock.offset(fixedClock,java.time.Duration.ofDays(1))).execute(admin,resolve))
        assertEquals(first.command.occurredAt,replay.command.occurredAt)
        assertEquals(NotificationLifecycle.RESOLVED,(replay.result as NotificationCommandResult.Applied).alert.lifecycle)
        assertEquals(1L,(replay.result as NotificationCommandResult.Applied).alert.revision.value)
        assertSame(NotificationCommandResult.InvalidTransition,recorded(repo.execute(admin,invalid)).result)
        assertEquals(1L,(recorded(repo.execute(admin,stale)).result as NotificationCommandResult.RevisionConflict).current.value)
        assertSame(NotificationExecutionResult.IdempotencyConflict,repo.execute(admin,request(alert,id=resolve.commandId.value,reason="Different")))
        assertSame(NotificationExecutionResult.IdempotencyConflict,repo.execute(actor(),resolve))
        assertSame(NotificationExecutionResult.IdempotencyConflict,repo.execute(admin,request(ingest(repo),id=resolve.commandId.value)))
        assertSame(NotificationExecutionResult.IdempotencyConflict,repo.execute(admin,request(alert,NotificationTransitionStep.Acknowledge,id=resolve.commandId.value)))
        val before=count("notification_command_receipts")
        root.update("DELETE FROM user_roles WHERE user_id=?",admin.userId)
        assertSame(NotificationExecutionResult.Unauthorized,repo.execute(admin,resolve))
        assertEquals(before,count("notification_command_receipts"))
        assertThrows(DataAccessException::class.java) { root.update("UPDATE notification_command_receipts SET reason='other' WHERE command_id=?",resolve.commandId.value) }
        assertThrows(DataAccessException::class.java) { root.update("DELETE FROM notification_lifecycle_audit WHERE command_id=?",resolve.commandId.value) }
    }

    @Test fun `unauthorized expired malformed and missing requests never persist receipts`() {
        val repo=repository(); val alert=ingest(repo); val admin=actor(); val before=count("notification_command_receipts")
        assertSame(NotificationExecutionResult.Unauthorized,repo.execute(actor(InternalRole.OPERATOR),request(alert)))
        assertSame(NotificationExecutionResult.Unknown,repo.execute(admin,request(alert,NotificationTransitionStep.Unknown)))
        val missing=NotificationLifecycleRequest(requireNotNull(NotificationCommandId.fromWire(UUID.randomUUID())),requireNotNull(NotificationId.fromWire(UUID.randomUUID())),alert.revision,NotificationTransitionStep.Resolve,requireNotNull(NotificationReason.fromWire("Missing")))
        assertSame(NotificationExecutionResult.Missing,repo.execute(admin,missing))
        val revoked=actor()
        root.update("UPDATE identity_sessions SET revoked_at=clock_timestamp(),revocation_kind='SELF',revoked_by_user_id=?,revocation_correlation_id=?,revoked_reason='Fixture' WHERE id=?",revoked.userId,UUID.randomUUID(),revoked.sessionId)
        assertSame(NotificationExecutionResult.Unauthorized,repo.execute(revoked,request(alert)))
        val expiredOwner=actor(); val expired=expiredOwner.copy(sessionId=UUID.randomUUID())
        root.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?,'USER',?,?,clock_timestamp()-interval '3 hours',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 hours')""",
            expired.sessionId,expired.userId,UUID.randomUUID().toString().replace("-", "").repeat(2))
        assertSame(NotificationExecutionResult.Unauthorized,repo.execute(expired,request(alert)))
        root.update("UPDATE users SET active=false WHERE id=?",admin.userId)
        assertSame(NotificationExecutionResult.Unauthorized,repo.execute(admin,request(alert)))
        assertEquals(before,count("notification_command_receipts"))
    }

    @Test fun `exhausted revision is recorded historically and malformed receipt snapshots never become success`() {
        val repo=repository(); val admin=actor(); val original=ingest(repo); val exhaustedId=UUID.randomUUID()
        root.update("INSERT INTO notification_alerts SELECT ?,source_type,source_id,?,category,severity,'OPEN',9223372036854775807,created_at FROM notification_alerts WHERE id=?",
            exhaustedId,"f".repeat(64),original.id.value)
        val exhausted=repo.find(requireNotNull(NotificationId.fromWire(exhaustedId)))!!
        val request=request(exhausted)
        val receipt=recorded(repo.execute(admin,request))
        assertSame(NotificationCommandResult.RevisionExhausted,receipt.result)
        assertSame(NotificationCommandResult.RevisionExhausted,recorded(repo.execute(admin,request)).result)
        assertEquals(Long.MAX_VALUE,repo.find(exhausted.id)!!.revision.value)
        val codec=NotificationSnapshotCodec(jacksonObjectMapper())
        val valid=codec.encode(original)
        assertNotNull(codec.decode(valid))
        listOf("{}",valid.replace("\"OPEN\"","\"FUTURE\""),valid.replace("\"0\"","\"00\""),valid.replace("\"revision\":\"0\"","\"revision\":0"),valid.replace("\"WARNING\"","\"UNKNOWN\""))
            .forEach { assertNull(codec.decode(it)) }
        assertNull(codec.receipt(receipt.command,"0".repeat(64),NotificationReceiptOutcome.APPLIED.wire,valid))
        assertNull(codec.receipt(receipt.command,receipt.command.payloadHash().value,"FUTURE",valid))
    }

    @Test fun `concurrent identical commands deduplicate and competing revisions have one applied effect`() {
        val repo=repository(); val alert=ingest(repo); val first=actor(); val second=actor(); val shared=request(alert)
        val same=race({repo.execute(first,shared)},{repo.execute(first,shared)})
        same.forEach { assertInstanceOf(NotificationCommandResult.Applied::class.java,recorded(it).result) }
        assertEquals(1,root.queryForObject("SELECT count(*) FROM notification_command_receipts WHERE command_id=?",Int::class.java,shared.commandId.value))
        val collisionAlert=ingest(repo); val collision=request(collisionAlert)
        val bound=race({repo.execute(first,collision)},{repo.execute(second,collision)})
        assertEquals(1,bound.count { it is NotificationExecutionResult.Recorded })
        assertEquals(1,bound.count { it == NotificationExecutionResult.IdempotencyConflict })
        assertEquals(1L,repo.find(collisionAlert.id)!!.revision.value)
        val next=ingest(repo)
        val competing=race({repo.execute(first,request(next))},{repo.execute(second,request(next,NotificationTransitionStep.Acknowledge))})
        assertEquals(1,competing.count { recorded(it).result is NotificationCommandResult.Applied })
        assertEquals(1,competing.count { recorded(it).result is NotificationCommandResult.RevisionConflict })
        assertEquals(1L,repo.find(next.id)!!.revision.value)
        val event=event()
        val ingestions=race({repo.ingest(event)},{repo.ingest(event(episode=event.episode.value))})
        assertEquals(1,ingestions.map { (it as NotificationIngestionResult.Recorded).alert.id }.distinct().size)
    }

    @Test fun `session expiring behind command advisory lock cannot replay a receipt`() {
        val repo=repository(); val admin=actor(); val alert=ingest(repo); val request=request(alert)
        recorded(repo.execute(admin,request))
        val expiring=shortSession(admin)
        val key=ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest("notification-command:${request.commandId.value}".toByteArray(Charsets.UTF_8))).long
        val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false
            blocker.prepareStatement("SELECT pg_advisory_xact_lock(?)").use { it.setLong(1,key); it.execute() }
            val result=pool.submit<NotificationExecutionResult> { repo.execute(expiring,request) }
            try {
                awaitDatabase { root.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%')",Boolean::class.java)!! }
                awaitExpiry(expiring)
                blocker.commit()
                assertSame(NotificationExecutionResult.Unauthorized,result.get(10,TimeUnit.SECONDS))
                assertEquals(1,root.queryForObject("SELECT count(*) FROM notification_command_receipts WHERE command_id=?",Int::class.java,request.commandId.value))
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
    }

    @Test fun `session expiring behind projection lock cannot commit an effect or receipt`() {
        val repo=repository(); val admin=actor(); val alert=ingest(repo); val request=request(alert); val expiring=shortSession(admin)
        val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false
            blocker.prepareStatement("SELECT id FROM notification_alerts WHERE id=? FOR UPDATE").use { it.setObject(1,alert.id.value); it.execute() }
            val result=pool.submit<NotificationExecutionResult> { repo.execute(expiring,request) }
            try {
                awaitDatabase { root.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT * FROM notification_alerts%FOR UPDATE')",Boolean::class.java)!! }
                awaitExpiry(expiring)
                blocker.commit()
                assertSame(NotificationExecutionResult.Unauthorized,result.get(10,TimeUnit.SECONDS))
                assertEquals(0L,repo.find(alert.id)!!.revision.value)
                assertEquals(0,root.queryForObject("SELECT count(*) FROM notification_command_receipts WHERE command_id=?",Int::class.java,request.commandId.value))
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
    }

    @Test fun `receipt and audit failures roll back projection effects and ingestion is atomic`() {
        val repo=repository(); val admin=actor(); val alert=ingest(repo); val request=request(alert)
        root.execute("CREATE FUNCTION notification_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'} BEGIN RAISE EXCEPTION 'fixture failure'; END ${'$'}${'$'}")
        root.execute("CREATE TRIGGER notification_fixture_audit BEFORE INSERT ON notification_lifecycle_audit FOR EACH ROW EXECUTE FUNCTION notification_fixture_fail()")
        try {
            assertThrows(DataAccessException::class.java) { repo.execute(admin,request) }
            assertEquals(0L,repo.find(alert.id)!!.revision.value)
            assertEquals(0,root.queryForObject("SELECT count(*) FROM notification_command_receipts WHERE command_id=?",Int::class.java,request.commandId.value))
        } finally { root.execute("DROP TRIGGER notification_fixture_audit ON notification_lifecycle_audit") }
        root.execute("CREATE TRIGGER notification_fixture_source BEFORE INSERT ON notification_source_events FOR EACH ROW EXECUTE FUNCTION notification_fixture_fail()")
        val event=event(); val before=count("notification_alerts")
        try { assertThrows(DataAccessException::class.java) { repo.ingest(event) }; assertEquals(before,count("notification_alerts")) }
        finally { root.execute("DROP TRIGGER notification_fixture_source ON notification_source_events"); root.execute("DROP FUNCTION notification_fixture_fail()") }
        assertInstanceOf(NotificationCommandResult.Applied::class.java,recorded(repo.execute(admin,request)).result)
    }

    private fun <T> race(first: () -> T, second: () -> T): List<T> {
        val pool=Executors.newFixedThreadPool(2); val barrier=CyclicBarrier(2)
        return try { pool.invokeAll(listOf(Callable { barrier.await(10,TimeUnit.SECONDS); first() },Callable { barrier.await(10,TimeUnit.SECONDS); second() }),30,TimeUnit.SECONDS)
            .map { it.get(30,TimeUnit.SECONDS) } } finally { pool.shutdownNow() }
    }
    private fun shortSession(actor: InternalUserPrincipal): InternalUserPrincipal {
        val session=UUID.randomUUID()
        root.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '3 seconds',clock_timestamp()+interval '2 hours')""",
            session,actor.userId,UUID.randomUUID().toString().replace("-", "").repeat(2))
        return actor.copy(sessionId=session)
    }
    private fun awaitExpiry(actor: InternalUserPrincipal) = awaitDatabase {
        root.queryForObject("SELECT idle_expires_at<clock_timestamp() FROM identity_sessions WHERE id=?",Boolean::class.java,actor.sessionId)!!
    }
    private fun awaitDatabase(condition: () -> Boolean) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        while(!condition()) { check(System.nanoTime()<deadline) { "Database condition timed out" }; Thread.sleep(20) }
    }
}
