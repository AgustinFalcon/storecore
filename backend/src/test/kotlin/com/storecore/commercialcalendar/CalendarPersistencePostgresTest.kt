package com.storecore.commercialcalendar

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.*
import com.storecore.identity.domain.*
import com.storecore.configuration.application.*
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.notification.application.NotificationEmailReadinessPort
import com.storecore.notification.application.NotificationEmailIntentProjection
import com.storecore.notification.application.NotificationIngestionResult
import com.storecore.notification.domain.NotificationEmailReadiness
import com.storecore.notification.domain.*
import com.storecore.notification.infrastructure.JdbcNotificationEmailProjection
import com.storecore.notification.infrastructure.JdbcNotificationPersistence
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.time.Clock
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class CalendarPersistencePostgresTest {
    companion object {
        private val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private fun flyway(url: String=postgres.jdbcUrl,target: String?=null)=Flyway.configure().dataSource(url,postgres.username,postgres.password).locations("classpath:db/migration").apply { if(target!=null) target(target) }.load()
        @JvmStatic @BeforeAll fun start() { postgres.start(); flyway().migrate() }
        @JvmStatic @AfterAll fun stop() { postgres.stop() }
    }
    private val root by lazy { JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password)) }
    private fun runtime(url: String=postgres.jdbcUrl)=object: DriverManagerDataSource(url,postgres.username,postgres.password) {
        override fun getConnection(): Connection=super.getConnection().also { it.createStatement().use { s -> s.execute("SET ROLE storecore_runtime") } }
    }
    private fun repo(clock: CalendarClock=MutableCalendarClock(),ids: CalendarIds=RandomCalendarIds(),url: String=postgres.jdbcUrl): JdbcCalendarPersistence {
        val source=runtime(url)
        return JdbcCalendarPersistence(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),jacksonObjectMapper(),clock,ids,CalendarFixtures.hasher)
    }
    private fun repo(connection: Connection,clock: CalendarClock=MutableCalendarClock()): JdbcCalendarPersistence {
        val source=SingleConnectionDataSource(connection,true)
        return JdbcCalendarPersistence(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),jacksonObjectMapper(),clock,RandomCalendarIds(),CalendarFixtures.hasher)
    }
    private fun handoffRepo(clock: CalendarClock,url: String=postgres.jdbcUrl): JdbcCalendarPersistence {
        val source=runtime(url); val jdbc=JdbcTemplate(source)
        return handoffRepo(clock,jdbc,TransactionTemplate(DataSourceTransactionManager(source)),JdbcNotificationEmailProjection(jdbc,NotificationEmailReadinessPort { NotificationEmailReadiness.READY }))
    }
    private fun handoffRepo(clock: CalendarClock,jdbc: JdbcTemplate,transactions: TransactionTemplate,emailProjection: NotificationEmailIntentProjection): JdbcCalendarPersistence {
        val mapper=jacksonObjectMapper()
        val notificationClock=Clock.fixed(clock.now(),ZoneOffset.UTC)
        val notifications=JdbcNotificationPersistence(jdbc,transactions,mapper,notificationClock,emailProjection)
        return JdbcCalendarPersistence(jdbc,transactions,mapper,clock,RandomCalendarIds(),CalendarFixtures.hasher,notifications)
    }
    private fun switchRepo(clock: CalendarClock=MutableCalendarClock(),active: Boolean=true,url: String=postgres.jdbcUrl): JdbcCalendarSwitchPersistence {
        val source=runtime(url)
        val capability=object: CapabilityDecisionPort { override fun decide(module: String,action: String,actor: CapabilityActor) { if(!active) throw CapabilityDisabled() } }
        return JdbcCalendarSwitchPersistence(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),jacksonObjectMapper(),clock,CalendarFixtures.hasher,capability)
    }
    private fun switchRequest(id: CalendarCommandId=CalendarFixtures.command(),revision: CalendarRevision=CalendarRevision.Zero,operation: CalendarSwitchOperation=CalendarSwitchOperation.ENABLE,expires: Instant=CalendarFixtures.now.plusSeconds(3600))=
        CalendarSwitchCommandRequest(id,revision,operation,requireNotNull(CalendarSwitchOwner.fromWire("Operations owner")),CalendarFixtures.reason,expires,requireNotNull(CalendarRemovalTicket.fromWire("OPS-442")),CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER)
    private fun switchRecorded(value: CalendarSwitchPersistenceResult)=assertInstanceOf(CalendarSwitchPersistenceResult.Recorded::class.java,value).receipt
    private fun actor(role: InternalRole=InternalRole.ADMIN,database: JdbcTemplate=root): InternalUserPrincipal {
        val id=database.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Calendar','Fixture') RETURNING id",Long::class.java,"calendar-${UUID.randomUUID()}@example.test","${'$'}argon2id${'$'}fixture")!!
        database.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role.name)
        val session=UUID.randomUUID()
        database.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES(?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",session,id,UUID.randomUUID().toString().replace("-","").repeat(2))
        return InternalUserPrincipal(session,id,setOf(role))
    }
    private fun enableOperationalEmailPreference(database: JdbcTemplate,userId: Long,url: String) {
        val source=DriverManagerDataSource(url,postgres.username,postgres.password)
        TransactionTemplate(DataSourceTransactionManager(source)).executeWithoutResult {
            val jdbc=JdbcTemplate(source); val token=UUID.randomUUID(); val correlation=UUID.randomUUID()
            jdbc.update("""WITH issued AS(SELECT clock_timestamp() value) INSERT INTO identity_email_verification_tokens(id,realm,user_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id)
                SELECT ?,'USER',id,?,email_version,encode(sha256(convert_to(email,'UTF8')),'hex'),value,value+interval '30 minutes',? FROM users CROSS JOIN issued WHERE id=?""",
                token,UUID.randomUUID().toString().replace("-","").repeat(2),correlation,userId)
            jdbc.update("UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=? WHERE id=?",correlation,token)
            jdbc.update("""INSERT INTO identity_email_verification_evidence(id,verification_token_id,realm,user_id,email_version,email_digest,verified_at,correlation_id)
                SELECT ?,id,realm,user_id,email_version,email_digest,terminal_at,terminal_correlation_id FROM identity_email_verification_tokens WHERE id=?""",UUID.randomUUID(),token)
            jdbc.update("INSERT INTO notification_email_preferences(user_id,state,revision) VALUES (?,'DISABLED',0)",userId)
            jdbc.update("""UPDATE notification_email_preferences p SET state='ENABLED',revision=1,categories=ARRAY['STOCK'],severities=ARRAY['WARNING'],
                email_version=u.email_version,email_digest=encode(sha256(convert_to(u.email,'UTF8')),'hex'),consented_at=clock_timestamp() FROM users u WHERE p.user_id=u.id AND p.user_id=?""",userId)
        }
        assertEquals(true,database.queryForObject("SELECT eligible AND verified FROM notification_email_account(?)",Boolean::class.java,userId))
    }
    private fun recorded(result: CalendarPersistenceResult)=assertInstanceOf(CalendarPersistenceResult.Recorded::class.java,result).receipt
    private fun systemRecorded(result: CalendarSystemAdvanceResult)=assertInstanceOf(CalendarSystemAdvanceResult.Recorded::class.java,result)
    private fun create(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,rules: List<CalendarReminderRule> = emptyList())=recorded(repo.create(actor,CalendarCreateRequest(CalendarFixtures.command(),CalendarFixtures.definition(rules=rules)))).after
    private fun create(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,definition: CalendarDefinition)=recorded(repo.create(actor,CalendarCreateRequest(CalendarFixtures.command(),definition))).after
    private fun request(event: CalendarEvent,step: CalendarStep,id: CalendarCommandId=CalendarFixtures.command(),revision: CalendarRevision=event.revision,definition: CalendarDefinition?=null,preflight: CalendarPreflightId?=null)=
        CalendarChangeRequest(id,event.id,revision,step,CalendarFixtures.reason,definition,preflight)
    private fun preflight(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,event: CalendarEvent)=assertInstanceOf(CalendarPreflightResult.Recorded::class.java,repo.preflight(actor,CalendarPreflightRequest(CalendarFixtures.command(),event.id,event.revision))).preflight!!
    private fun schedule(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,event: CalendarEvent)=recorded(repo.change(actor,request(event,CalendarStep.Schedule,preflight=preflight(repo,actor,event).id))).after
    private fun forceSwitch(state: CalendarSwitchState,createdAt: Instant=CalendarFixtures.now,expiresAt: Instant=CalendarFixtures.now.plusSeconds(86_400),database: JdbcTemplate=root) {
        database.execute("ALTER TABLE calendar_reminder_switch DISABLE TRIGGER trg_calendar_protect_reminder_switch")
        try {
            database.update("""UPDATE calendar_reminder_switch SET state=?,revision=revision+1,owner='PCC-008D fixture',reason='Deterministic worker fixture',created_at=?,expires_at=?,removal_ticket='PCC-008D',affected_action='EMIT_IN_APP_CAMPAIGN_REMINDER' WHERE id=1""",
                state.wire,Timestamp.from(createdAt),Timestamp.from(expiresAt))
        } finally { database.execute("ALTER TABLE calendar_reminder_switch ENABLE TRIGGER trg_calendar_protect_reminder_switch") }
    }
    private fun isolatedDatabase(label: String): Pair<String,JdbcTemplate> {
        val name="calendar_${label}_${UUID.randomUUID().toString().replace("-","")}"
        root.execute("CREATE DATABASE $name")
        val url=postgres.jdbcUrl.substringBeforeLast('/')+"/$name"
        flyway(url).migrate()
        return url to JdbcTemplate(DriverManagerDataSource(url,postgres.username,postgres.password))
    }

    @Test fun `PCC 008B migration closes singleton governance global identity and least privilege`() {
        root.execute("CREATE DATABASE calendar_switch_contract")
        val contractUrl=postgres.jdbcUrl.substringBeforeLast('/')+"/calendar_switch_contract"
        flyway(contractUrl).migrate()
        val contract=JdbcTemplate(DriverManagerDataSource(contractUrl,postgres.username,postgres.password))
        val columns=contract.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='calendar_reminder_switch'",String::class.java).toSet()
        assertTrue(columns.containsAll(setOf("owner","reason","created_at","expires_at","removal_ticket","affected_action")))
        val bootstrap=contract.queryForMap("SELECT * FROM calendar_reminder_switch WHERE id=1")
        assertEquals("DISABLED",bootstrap["state"]); assertEquals(0L,(bootstrap["revision"] as Number).toLong())
        for(column in listOf("owner","reason","created_at","expires_at","removal_ticket","affected_action")) assertNull(bootstrap[column])
        assertFalse(contract.queryForObject("SELECT future_optional FROM capability_modules WHERE module_code='COMMERCIAL_CALENDAR'",Boolean::class.java)!!)
        assertEquals("DISABLED",contract.queryForObject("SELECT state FROM module_configurations WHERE module_code='COMMERCIAL_CALENDAR'",String::class.java))
        assertEquals("PUBLISH",contract.queryForObject("SELECT action_kind FROM capability_actions WHERE module_code='COMMERCIAL_CALENDAR' AND action_code='EMIT_IN_APP_CAMPAIGN_REMINDER'",String::class.java))
        for(table in listOf("calendar_switch_command_receipts","calendar_switch_audit")) {
            assertFalse(root.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'INSERT,UPDATE,DELETE')",Boolean::class.java,table)!!)
        }
        val admin=actor(); val switchId=UUID.randomUUID()
        root.update("INSERT INTO calendar_command_bindings(command_id,family,actor_id,event_id,payload_hash) VALUES(?,'REMINDER_SWITCH',?,NULL,?)",switchId,admin.userId,"a".repeat(64))
        assertThrows(DataAccessException::class.java) { root.update("INSERT INTO calendar_command_bindings(command_id,family,actor_id,event_id,payload_hash) VALUES(?,'EVENT',?,NULL,?)",UUID.randomUUID(),admin.userId,"b".repeat(64)) }
        val event=create(repo(),admin)
        assertThrows(DataAccessException::class.java) { root.update("INSERT INTO calendar_command_bindings(command_id,family,actor_id,event_id,payload_hash) VALUES(?,'REMINDER_SWITCH',?,?,?)",UUID.randomUUID(),admin.userId,event.id.value,"c".repeat(64)) }
        assertThrows(DataAccessException::class.java) { JdbcTemplate(runtime()).update("UPDATE calendar_reminder_switch SET state='ENABLED',revision=1 WHERE id=1") }
    }
    @Test fun `switch writer replays before clock guards and preserves global collisions and safety disable`() {
        val clock=MutableCalendarClock(); val admin=actor(); val foreign=actor(); val active=switchRepo(clock,true)
        val enable=switchRequest(); val enabled=switchRecorded(active.change(admin,enable))
        assertEquals(CalendarOutcome.APPLIED,enabled.outcome); assertEquals(CalendarSwitchState.ENABLED,enabled.after.configuredState)
        clock.instant=enable.expiresAt.plusSeconds(60)
        val replay=switchRecorded(active.change(admin,enable))
        assertEquals(enabled.recordedAt,replay.recordedAt); assertEquals(enabled.after.revision,replay.after.revision)
        assertEquals(enabled.recordedAt,switchRecorded(switchRepo(clock,false).change(admin,enable)).recordedAt)
        assertEquals(CalendarSwitchPersistenceResult.IdempotencyConflict,active.change(admin,enable.copy(owner=requireNotNull(CalendarSwitchOwner.fromWire("Other owner")))))
        assertEquals(CalendarSwitchPersistenceResult.Missing,active.receipt(foreign,enable.commandId))
        assertEquals(CalendarSwitchPersistenceResult.Invalid,active.change(admin,switchRequest(expires=clock.instant.plusSeconds(300))))
        assertEquals(CalendarSwitchPersistenceResult.Invalid,active.change(admin,switchRequest(expires=clock.instant.plusSeconds(7L*86400+1))))
        val disable=switchRequest(revision=enabled.after.revision,operation=CalendarSwitchOperation.DISABLE,expires=clock.instant.plusSeconds(3600))
        val disabled=switchRecorded(switchRepo(clock,false).change(admin,disable))
        assertEquals(CalendarOutcome.INVALID_TRANSITION,disabled.outcome)
        val renewed=switchRecorded(active.change(admin,switchRequest(revision=enabled.after.revision,expires=clock.instant.plusSeconds(3600))))
        val safe=switchRecorded(switchRepo(clock,false).change(admin,switchRequest(revision=renewed.after.revision,operation=CalendarSwitchOperation.DISABLE,expires=clock.instant.plusSeconds(3600))))
        assertEquals(CalendarOutcome.APPLIED,safe.outcome); assertEquals(CalendarSwitchState.DISABLED,safe.after.configuredState)
        val barrier=CyclicBarrier(2); val pool=Executors.newFixedThreadPool(2)
        try {
            val raced=(1..2).map { pool.submit<CalendarOutcome> { barrier.await(); switchRecorded(active.change(admin,switchRequest(revision=safe.after.revision,expires=clock.instant.plusSeconds(3600)))).outcome } }.map { it.get(10,TimeUnit.SECONDS) }
            assertEquals(setOf(CalendarOutcome.APPLIED,CalendarOutcome.REVISION_CONFLICT),raced.toSet())
        } finally { pool.shutdownNow() }
        root.update("DELETE FROM user_roles WHERE user_id=?",admin.userId)
        assertEquals(CalendarSwitchPersistenceResult.Unauthorized,active.change(admin,enable))
        root.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'",admin.userId)
        assertEquals(enabled.recordedAt,switchRecorded(active.change(admin,enable)).recordedAt)
        assertThrows(DataAccessException::class.java) { root.update("UPDATE calendar_switch_command_receipts SET outcome='INVALID_TRANSITION' WHERE command_id=?",enable.commandId.value) }
        assertEquals(6L,(assertInstanceOf(CalendarQueryResult.Found::class.java,active.audit(admin,CalendarPageRequest.create()!!)).value as CalendarPage<*>).total)
    }

    @Test fun `blocked enable takes its no backfill cutoff after the singleton lock`() {
        val (url,database)=isolatedDatabase("blocked_enable_cutoff")
        val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database); val rule=CalendarFixtures.rule()
        val event=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Blocked enable cutoff",rules=listOf(rule))))
        val due=event.definition.start.instant.minusSeconds(rule.offsetSeconds)
        forceSwitch(CalendarSwitchState.DISABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        clock.instant=due.minusSeconds(10)
        val switchRevision=requireNotNull(CalendarRevision.fromWire(database.queryForObject("SELECT revision FROM calendar_reminder_switch WHERE id=1",Long::class.java)))
        val request=switchRequest(revision=switchRevision,expires=due.plusSeconds(3600)); val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(url,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false
            blocker.prepareStatement("SELECT * FROM calendar_reminder_switch WHERE id=1 FOR UPDATE").use { it.executeQuery().use { rows -> assertTrue(rows.next()) } }
            val future=pool.submit<CalendarSwitchPersistenceResult> { switchRepo(clock,true,url).change(admin,request) }
            try {
                awaitDatabase { database.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%calendar_lock_reminder_switch%')",Boolean::class.java)!! }
                clock.instant=due.plusSeconds(10)
                blocker.commit()
                val receipt=switchRecorded(future.get(20,TimeUnit.SECONDS))
                assertEquals(CalendarOutcome.APPLIED,receipt.outcome)
                assertEquals(clock.instant,receipt.recordedAt)
                assertEquals(clock.instant,receipt.requestedMetadata.createdAt)
                val page=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repo(clock,url=url)).claim(CalendarLeaseOwner.fromWire(UUID.randomUUID())!!))
                assertEquals(1,page.skipped); assertEquals(0,page.leased)
                assertEquals("ENABLE_CUTOFF",database.queryForObject("SELECT terminal_reason FROM calendar_reminder_occurrences",String::class.java))
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
    }

    @Test fun `clean and V35 upgrade preserve every published checksum and default disabled least privilege`() {
        root.execute("CREATE DATABASE calendar_upgrade")
        val url=postgres.jdbcUrl.substringBeforeLast('/')+"/calendar_upgrade"
        flyway(url,"35").migrate()
        val upgraded=JdbcTemplate(DriverManagerDataSource(url,postgres.username,postgres.password))
        val history=upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("39",flyway(url).migrate().targetSchemaVersion.toString())
        assertEquals(history,upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=35 ORDER BY installed_rank"))
        assertEquals(0,flyway(url).migrate().migrationsExecuted); flyway(url).validate()
        for(database in listOf(root,upgraded)) {
            assertEquals("DISABLED",database.queryForObject("SELECT state FROM calendar_reminder_switch WHERE id=1",String::class.java))
            for(table in listOf("calendar_definitions","calendar_reminder_rules","calendar_preflights","calendar_command_bindings","calendar_preflight_requests","calendar_command_receipts","calendar_audit")) {
                assertTrue(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'SELECT,INSERT')",Boolean::class.java,table)!!)
                assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'UPDATE')",Boolean::class.java,table)!!)
                assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'DELETE')",Boolean::class.java,table)!!)
            }
            for(table in listOf("calendar_reminder_occurrences","calendar_reminder_switch")) assertFalse(database.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'UPDATE')",Boolean::class.java,table)!!)
            assertFalse(database.queryForObject("SELECT has_column_privilege('storecore_runtime','calendar_events','id','UPDATE')",Boolean::class.java)!!)
        }
        val runtime=JdbcTemplate(runtime())
        assertThrows(DataAccessException::class.java) { runtime.update("UPDATE calendar_reminder_switch SET state='ENABLED',revision=1 WHERE id=1") }
        assertThrows(DataAccessException::class.java) { runtime.update("UPDATE calendar_reminder_occurrences SET state='EMITTED'") }
        assertEquals(CalendarSwitchState.DISABLED,repo().reminderSwitch().state)
    }

    @Test fun `V38 upgrade preserves all published calendar migration checksums`() {
        val name="calendar_v38_upgrade_${UUID.randomUUID().toString().replace("-","")}"
        root.execute("CREATE DATABASE $name")
        val url=postgres.jdbcUrl.substringBeforeLast('/')+"/$name"
        flyway(url,"38").migrate()
        val database=JdbcTemplate(DriverManagerDataSource(url,postgres.username,postgres.password))
        val published=database.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=38 ORDER BY installed_rank")
        assertEquals("39",flyway(url).migrate().targetSchemaVersion.toString())
        assertEquals(published,database.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=38 ORDER BY installed_rank"))
        assertEquals(1,database.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version='39' AND success",Int::class.java))
        assertEquals(0,flyway(url).migrate().migrationsExecuted)
        flyway(url).validate()
    }

    @Test fun `PCC 008D migration exposes only fenced mutation functions and protects occurrence shape`() {
        val columns=root.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='calendar_reminder_occurrences'",String::class.java).toSet()
        assertTrue(columns.containsAll(setOf("next_attempt_at","lease_started_at","terminal_reason","terminal_at","last_failure_class")))
        assertFalse(root.queryForObject("SELECT has_table_privilege('storecore_runtime','calendar_reminder_occurrences','UPDATE')",Boolean::class.java)!!)
        for(signature in listOf(
            "calendar_lock_due_occurrences(timestamp with time zone,integer)",
            "calendar_lease_occurrence(uuid,text,integer,uuid,timestamp with time zone,timestamp with time zone)",
            "calendar_skip_occurrence(uuid,text,integer,uuid,text,timestamp with time zone)",
            "calendar_exhaust_occurrence(uuid,uuid,integer,timestamp with time zone)",
            "calendar_settle_occurrence_failure(uuid,uuid,integer,text,timestamp with time zone)",
        )) assertTrue(root.queryForObject("SELECT has_function_privilege('storecore_runtime',?,'EXECUTE')",Boolean::class.java,signature)!!)
        val runtime=JdbcTemplate(runtime())
        assertThrows(DataAccessException::class.java) { runtime.queryForList("SELECT * FROM calendar_lock_due_occurrences(clock_timestamp(),51)") }
        assertThrows(DataAccessException::class.java) { runtime.queryForObject("SELECT calendar_settle_occurrence_failure(?,?,?,?,?)",String::class.java,UUID.randomUUID(),UUID.randomUUID(),1,"FUTURE",Timestamp.from(CalendarFixtures.now)) }
        assertThrows(DataAccessException::class.java) { root.update("UPDATE calendar_reminder_occurrences SET state='EMITTED'") }
    }

    @Test fun `PCC 008E migration exposes only fenced handoff writers and immutable evidence`() {
        assertFalse(root.queryForObject("SELECT has_table_privilege('storecore_runtime','calendar_occurrence_handoffs','INSERT,UPDATE,DELETE')",Boolean::class.java)!!)
        assertTrue(root.queryForObject("SELECT has_table_privilege('storecore_runtime','calendar_occurrence_handoffs','SELECT')",Boolean::class.java)!!)
        assertFalse(root.queryForObject("SELECT has_table_privilege('storecore_runtime','calendar_reminder_occurrences','UPDATE')",Boolean::class.java)!!)
        for(signature in listOf(
            "calendar_lock_occurrence(uuid)",
            "calendar_skip_leased_occurrence(uuid,uuid,integer,text,timestamp with time zone)",
            "calendar_complete_occurrence_handoff(uuid,uuid,integer,uuid,timestamp with time zone)",
        )) assertTrue(root.queryForObject("SELECT has_function_privilege('storecore_runtime',?,'EXECUTE')",Boolean::class.java,signature)!!)
        val runtime=JdbcTemplate(runtime())
        assertThrows(DataAccessException::class.java) { runtime.update("INSERT INTO calendar_occurrence_handoffs VALUES (?,?,?,?,?,?)",UUID.randomUUID(),UUID.randomUUID(),1,UUID.randomUUID(),UUID.randomUUID(),Timestamp.from(CalendarFixtures.now)) }
        assertThrows(DataAccessException::class.java) { runtime.queryForList("SELECT * FROM calendar_lock_occurrence(NULL)") }
        assertThrows(DataAccessException::class.java) { runtime.queryForList("SELECT * FROM calendar_lock_occurrence('00000000-0000-0000-0000-000000000000')") }
        assertThrows(DataAccessException::class.java) { runtime.queryForObject("SELECT calendar_complete_occurrence_handoff(?,?,?,?,?)",Boolean::class.java,UUID.randomUUID(),UUID.randomUUID(),1,UUID.randomUUID(),Timestamp.from(CalendarFixtures.now)) }
    }

    @Test fun `atomic handoff emits once replays lost response and never creates email intent`() {
        val (url,database)=isolatedDatabase("handoff_once"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        enableOperationalEmailPreference(database,admin.userId,url)
        val rule=CalendarFixtures.rule(600); schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Atomic handoff",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant()
        forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database)
        clock.instant=due
        val owner=requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))
        val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(owner)).records.single()
        val emitted=assertInstanceOf(CalendarOccurrenceHandoffResult.Emitted::class.java,CalendarOccurrenceHandoffService(repository).handoff(lease))
        assertEquals("EMITTED",database.queryForObject("SELECT state FROM calendar_reminder_occurrences WHERE id=?",String::class.java,lease.occurrence.id.value))
        assertEquals(1,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs WHERE occurrence_id=?",Int::class.java,lease.occurrence.id.value))
        val source=database.queryForMap("SELECT * FROM notification_source_events WHERE delivery_id=?",lease.occurrence.id.value)
        assertEquals("SYSTEM_CAMPAIGN",source["source_type"]); assertEquals("CAMPAIGN",source["category"]); assertEquals("INFO",source["severity"])
        assertEquals("CALENDAR_REMINDER_DUE",source["condition_code"]); assertEquals(lease.occurrence.id.value.toString(),source["episode_key"])
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_email_outbox",Int::class.java))
        val replay=assertInstanceOf(CalendarOccurrenceHandoffResult.Replayed::class.java,CalendarOccurrenceHandoffService(repository).handoff(lease))
        assertEquals(emitted.alertId,replay.alertId)
        assertEquals(1,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(1,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        val staleOwner=requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))
        val staleOccurrence=requireNotNull(CalendarReminderOccurrence.restore(lease.occurrence.id,lease.occurrence.eventId,lease.occurrence.approvedDefinitionRevision,lease.occurrence.ruleId,lease.occurrence.scheduledAt,CalendarOccurrenceState.LEASED,lease.token.attempt,staleOwner.value,lease.leaseUntil))
        val stale=requireNotNull(CalendarOccurrenceLease.from(staleOccurrence,lease.observedAt,lease.leaseGrantedAt))
        assertSame(CalendarOccurrenceHandoffResult.LostFence,CalendarOccurrenceHandoffService(repository).handoff(stale))
        val staleAttemptOccurrence=requireNotNull(CalendarReminderOccurrence.restore(lease.occurrence.id,lease.occurrence.eventId,lease.occurrence.approvedDefinitionRevision,lease.occurrence.ruleId,lease.occurrence.scheduledAt,CalendarOccurrenceState.LEASED,lease.token.attempt+1,lease.token.owner.value,lease.leaseUntil))
        val staleAttempt=requireNotNull(CalendarOccurrenceLease.from(staleAttemptOccurrence,lease.observedAt,lease.leaseGrantedAt))
        assertSame(CalendarOccurrenceHandoffResult.LostFence,CalendarOccurrenceHandoffService(repository).handoff(staleAttempt))
    }

    @Test fun `concurrent runners claim once emit one alert and never create email intent`() {
        val (url,database)=isolatedDatabase("runner_once")
        val clock=MutableCalendarClock()
        val setup=handoffRepo(clock,url)
        val admin=actor(database=database)
        val rule=CalendarFixtures.rule(600)
        schedule(setup,admin,create(setup,admin,CalendarFixtures.definition(title="Runner activation",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant()
        forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database)
        clock.instant=due

        fun runner(): CalendarReminderRunner {
            val repository=handoffRepo(clock,url)
            return CalendarReminderRunner(
                CalendarSystemCycleService(clock,repository),
                CalendarOccurrenceWorkerService(clock,repository),
                CalendarOccurrenceHandoffService(repository),
                requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())),
            )
        }

        val barrier=CyclicBarrier(2)
        val pool=Executors.newFixedThreadPool(2)
        try {
            val results=listOf(runner(),runner()).map { worker ->
                pool.submit<CalendarRunnerTickResult> { barrier.await(); worker.tick() }
            }.map { it.get(15,TimeUnit.SECONDS) }
            assertEquals(2,results.count { it is CalendarRunnerTickResult.Completed })
            assertEquals(1,results.filterIsInstance<CalendarRunnerTickResult.Completed>().sumOf { it.progress.emitted })
            assertEquals(1,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
            assertEquals(1,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
            assertEquals(1,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs",Int::class.java))
            assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_email_outbox",Int::class.java))
            assertEquals("EMITTED",database.queryForObject("SELECT state FROM calendar_reminder_occurrences",String::class.java))
        } finally { pool.shutdownNow() }
    }

    @Test fun `replay validates evidence before stale fence classification`() {
        val (url,database)=isolatedDatabase("handoff_corrupt_replay"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        val rule=CalendarFixtures.rule(600); schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Corrupt replay",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
        val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single()
        assertInstanceOf(CalendarOccurrenceHandoffResult.Emitted::class.java,CalendarOccurrenceHandoffService(repository).handoff(lease))
        database.execute("ALTER TABLE calendar_occurrence_handoffs DISABLE TRIGGER trg_calendar_handoff_immutable")
        try { database.update("UPDATE calendar_occurrence_handoffs SET attempt=attempt+1 WHERE occurrence_id=?",lease.occurrence.id.value) }
        finally { database.execute("ALTER TABLE calendar_occurrence_handoffs ENABLE TRIGGER trg_calendar_handoff_immutable") }
        val staleOwner=requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))
        val staleOccurrence=requireNotNull(CalendarReminderOccurrence.restore(lease.occurrence.id,lease.occurrence.eventId,lease.occurrence.approvedDefinitionRevision,lease.occurrence.ruleId,lease.occurrence.scheduledAt,CalendarOccurrenceState.LEASED,lease.token.attempt,staleOwner.value,lease.leaseUntil))
        val stale=requireNotNull(CalendarOccurrenceLease.from(staleOccurrence,lease.observedAt,lease.leaseGrantedAt))
        assertSame(CalendarOccurrenceHandoffResult.Corrupt,CalendarOccurrenceHandoffService(repository).handoff(stale))
    }

    @Test fun `partial handoff evidence corruption always fails closed without extra effects`() {
        val (url,database)=isolatedDatabase("handoff_partial_corruption"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        fun emitted(title: String): CalendarOccurrenceLease {
            clock.instant=CalendarFixtures.now
            val rule=CalendarFixtures.rule(600); val event=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title=title,rules=listOf(rule))))
            val occurrenceId=database.queryForObject("SELECT id FROM calendar_reminder_occurrences WHERE event_id=?",UUID::class.java,event.id.value)!!
            val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences WHERE id=?",Timestamp::class.java,occurrenceId)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
            val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single { it.occurrence.id.value==occurrenceId }
            assertInstanceOf(CalendarOccurrenceHandoffResult.Emitted::class.java,CalendarOccurrenceHandoffService(repository).handoff(lease))
            return lease
        }

        val missing=emitted("Missing evidence")
        database.execute("ALTER TABLE calendar_occurrence_handoffs DISABLE TRIGGER trg_calendar_handoff_immutable")
        try { database.update("DELETE FROM calendar_occurrence_handoffs WHERE occurrence_id=?",missing.occurrence.id.value) }
        finally { database.execute("ALTER TABLE calendar_occurrence_handoffs ENABLE TRIGGER trg_calendar_handoff_immutable") }
        assertSame(CalendarOccurrenceHandoffResult.Corrupt,CalendarOccurrenceHandoffService(repository).handoff(missing))

        val nonEmitted=emitted("Evidence on leased state")
        database.execute("ALTER TABLE calendar_reminder_occurrences DISABLE TRIGGER trg_calendar_occurrence_worker")
        database.execute("ALTER TABLE calendar_reminder_occurrences DISABLE TRIGGER trg_calendar_occurrence_handoff_consistency")
        try { database.update("""UPDATE calendar_reminder_occurrences SET state='LEASED',next_attempt_at=NULL,lease_owner=?,lease_started_at=?,lease_until=?,terminal_reason=NULL,terminal_at=NULL,last_failure_class=NULL WHERE id=?""",
            nonEmitted.token.owner.value,Timestamp.from(clock.instant),Timestamp.from(clock.instant.plusSeconds(60)),nonEmitted.occurrence.id.value) }
        finally {
            database.execute("ALTER TABLE calendar_reminder_occurrences ENABLE TRIGGER trg_calendar_occurrence_handoff_consistency")
            database.execute("ALTER TABLE calendar_reminder_occurrences ENABLE TRIGGER trg_calendar_occurrence_worker")
        }
        assertSame(CalendarOccurrenceHandoffResult.Corrupt,CalendarOccurrenceHandoffService(repository).handoff(nonEmitted))

        val badSource=emitted("Bad source hash")
        database.execute("ALTER TABLE notification_source_events DISABLE TRIGGER trg_notification_source_immutable")
        database.execute("ALTER TABLE notification_source_events DROP CONSTRAINT notification_source_events_check1")
        try { database.update("UPDATE notification_source_events SET event_hash=? WHERE delivery_id=?","0".repeat(64),badSource.occurrence.id.value) }
        finally { database.execute("ALTER TABLE notification_source_events ENABLE TRIGGER trg_notification_source_immutable") }
        assertSame(CalendarOccurrenceHandoffResult.Corrupt,CalendarOccurrenceHandoffService(repository).handoff(badSource))

        val badAlert=emitted("Bad alert identity")
        database.execute("ALTER TABLE notification_alerts DISABLE TRIGGER trg_notification_projection")
        database.execute("ALTER TABLE notification_alerts DISABLE TRIGGER trg_calendar_alert_handoff_consistency")
        try { database.update("UPDATE notification_alerts SET severity='WARNING' WHERE source_type='SYSTEM_CAMPAIGN' AND source_id=?",badAlert.occurrence.id.value.toString()) }
        finally {
            database.execute("ALTER TABLE notification_alerts ENABLE TRIGGER trg_calendar_alert_handoff_consistency")
            database.execute("ALTER TABLE notification_alerts ENABLE TRIGGER trg_notification_projection")
        }
        assertSame(CalendarOccurrenceHandoffResult.Corrupt,CalendarOccurrenceHandoffService(repository).handoff(badAlert))
        assertEquals(4,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(4,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(3,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs",Int::class.java))
    }

    @Test fun `concurrent handoff has one emission and one replay with one alert`() {
        val (url,database)=isolatedDatabase("handoff_race"); val clock=MutableCalendarClock(); val setup=handoffRepo(clock,url); val admin=actor(database=database)
        val rule=CalendarFixtures.rule(600); schedule(setup,admin,create(setup,admin,CalendarFixtures.definition(title="Concurrent handoff",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
        val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,setup).claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single()
        val barrier=CyclicBarrier(2); val pool=Executors.newFixedThreadPool(2)
        try {
            val results=(1..2).map { pool.submit<CalendarOccurrenceHandoffResult> { barrier.await(); CalendarOccurrenceHandoffService(handoffRepo(clock,url)).handoff(lease) } }.map { it.get(15,TimeUnit.SECONDS) }
            assertEquals(1,results.count { it is CalendarOccurrenceHandoffResult.Emitted }); assertEquals(1,results.count { it is CalendarOccurrenceHandoffResult.Replayed })
            assertEquals(1,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
            assertEquals(1,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs",Int::class.java))
        } finally { pool.shutdownNow() }
    }

    @Test fun `concurrent alternative delivery for reserved episode never masquerades as created handoff`() {
        val (url,database)=isolatedDatabase("handoff_alternative_delivery"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        val rule=CalendarFixtures.rule(600); schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Alternative delivery",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
        val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single()
        val identity=lease.occurrence.id.value.toString().lowercase()
        val alternative=requireNotNull(NotificationSourceEvent.create(
            requireNotNull(NotificationDeliveryId.fromWire(UUID.randomUUID())),
            requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.SYSTEM_CAMPAIGN,requireNotNull(NotificationSourceId.fromWire(identity)))),
            NotificationCategory.CAMPAIGN,NotificationSeverity.INFO,requireNotNull(NotificationConditionCode.fromWire("CALENDAR_REMINDER_DUE")),requireNotNull(NotificationEpisodeKey.fromWire(identity)),
        ))
        val source=runtime(url); val jdbc=JdbcTemplate(source); val transactions=TransactionTemplate(DataSourceTransactionManager(source))
        val producer=JdbcNotificationPersistence(jdbc,transactions,jacksonObjectMapper(),Clock.fixed(clock.instant,ZoneOffset.UTC))
        val barrier=CyclicBarrier(2); val pool=Executors.newFixedThreadPool(2)
        try {
            val handoffFuture=pool.submit<CalendarOccurrenceHandoffResult> { barrier.await(); CalendarOccurrenceHandoffService(repository).handoff(lease) }
            val alternativeFuture=pool.submit<NotificationIngestionResult> { barrier.await(); producer.ingest(alternative) }
            val handoff=assertInstanceOf(CalendarOccurrenceHandoffResult.Emitted::class.java,handoffFuture.get(15,TimeUnit.SECONDS))
            val rejected=assertThrows(java.util.concurrent.ExecutionException::class.java) { alternativeFuture.get(15,TimeUnit.SECONDS) }
            assertInstanceOf(org.springframework.transaction.TransactionSystemException::class.java,rejected.cause)
            assertEquals(1,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
            assertEquals(1,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE delivery_id=?",Int::class.java,lease.occurrence.id.value))
            assertEquals("EMITTED",database.queryForObject("SELECT state FROM calendar_reminder_occurrences",String::class.java))
            assertEquals(1,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs",Int::class.java))
        } finally { pool.shutdownNow() }
    }

    @Test fun `valid third lease can skip after disable while expired third lease remains dead`() {
        val (url,database)=isolatedDatabase("handoff_third"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        val rule=CalendarFixtures.rule(600); schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Third handoff",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
        val owner=requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())); val worker=CalendarOccurrenceWorkerService(clock,repository)
        val first=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single(); clock.instant=first.leaseUntil
        val second=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single(); clock.instant=second.leaseUntil
        val third=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single()
        forceSwitch(CalendarSwitchState.DISABLED,clock.instant,clock.instant.plusSeconds(3600),database)
        val skipped=assertInstanceOf(CalendarOccurrenceHandoffResult.Skipped::class.java,CalendarOccurrenceHandoffService(repository).handoff(third))
        assertEquals(CalendarOccurrenceTerminalReason.SWITCH_DISABLED,skipped.reason); assertEquals("SKIPPED",database.queryForObject("SELECT state FROM calendar_reminder_occurrences",String::class.java))
        assertEquals(3,database.queryForObject("SELECT attempts FROM calendar_reminder_occurrences",Int::class.java)); assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
    }

    @Test fun `every handoff guard can terminalize a still valid third lease without effects`() {
        val (url,database)=isolatedDatabase("handoff_third_guards"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        data class ThirdFixture(val event: CalendarEvent,val rule: CalendarReminderRule,val due: Instant,val lease: CalendarOccurrenceLease)
        fun third(title: String,offset: Long=600,thirdAt: (Instant,CalendarEvent)->Instant = { due,_->due.plusSeconds(120) },endAfterStart: Long=7200): ThirdFixture {
            clock.instant=CalendarFixtures.now
            val rule=CalendarFixtures.rule(offset); val start=CalendarFixtures.now.plusSeconds(3600)
            val event=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title=title,start=start,end=start.plusSeconds(endAfterStart),rules=listOf(rule))))
            val due=event.definition.start.instant.minusSeconds(rule.offsetSeconds)
            forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(20_000),database)
            val worker=CalendarOccurrenceWorkerService(clock,repository); val owner=requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))
            clock.instant=due
            val first=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single { it.occurrence.eventId==event.id }
            clock.instant=first.leaseUntil
            val second=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single { it.occurrence.eventId==event.id }
            clock.instant=thirdAt(due,event)
            assertTrue(clock.instant>=second.leaseUntil)
            val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single { it.occurrence.eventId==event.id }
            assertEquals(3,lease.token.attempt)
            return ThirdFixture(event,rule,due,lease)
        }
        fun assertSkipped(fixture: ThirdFixture,reason: CalendarOccurrenceTerminalReason) {
            val result=assertInstanceOf(CalendarOccurrenceHandoffResult.Skipped::class.java,CalendarOccurrenceHandoffService(repository).handoff(fixture.lease))
            assertEquals(reason,result.reason)
            val row=database.queryForMap("SELECT state,attempts,lease_owner,lease_until,terminal_reason FROM calendar_reminder_occurrences WHERE id=?",fixture.lease.occurrence.id.value)
            assertEquals("SKIPPED",row["state"]); assertEquals(3,(row["attempts"] as Number).toInt()); assertNull(row["lease_owner"]); assertNull(row["lease_until"]); assertEquals(reason.wire,row["terminal_reason"])
            assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE delivery_id=?",Int::class.java,fixture.lease.occurrence.id.value))
            assertEquals(0,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs WHERE occurrence_id=?",Int::class.java,fixture.lease.occurrence.id.value))
        }

        val late=third("Third late",thirdAt={ due,_->due.plusSeconds(900) }); clock.instant=late.due.plusSeconds(901); assertSkipped(late,CalendarOccurrenceTerminalReason.LATE)
        val disabled=third("Third disabled"); forceSwitch(CalendarSwitchState.DISABLED,clock.instant,clock.instant.plusSeconds(3600),database); assertSkipped(disabled,CalendarOccurrenceTerminalReason.SWITCH_DISABLED)
        val expired=third("Third expired"); forceSwitch(CalendarSwitchState.ENABLED,expired.due.minusSeconds(1),clock.instant.plusSeconds(1),database); clock.instant=clock.instant.plusSeconds(1); assertSkipped(expired,CalendarOccurrenceTerminalReason.SWITCH_EXPIRED)
        val reenabled=third("Third re-enabled"); forceSwitch(CalendarSwitchState.ENABLED,reenabled.due,clock.instant.plusSeconds(3600),database); assertSkipped(reenabled,CalendarOccurrenceTerminalReason.ENABLE_CUTOFF)

        val changed=third("Third definition changed")
        val replacement=CalendarFixtures.definition(1,"Replacement",changed.event.definition.start.instant,changed.event.definition.end.instant,listOf(changed.rule))
        val replacementEvent=CalendarEvent.restore(changed.event.id,changed.event.revision.next()!!,CalendarLifecycle.SCHEDULED,replacement,replacement.revision,changed.event.createdAt)!!
        val codec=CalendarSnapshotCodec(jacksonObjectMapper(),CalendarFixtures.hasher)
        database.execute("ALTER TABLE calendar_definitions DISABLE TRIGGER trg_calendar_rules_definition")
        try { database.update("INSERT INTO calendar_definitions(event_id,definition_revision,definition_hash,snapshot) VALUES(?,?,?,?::jsonb)",changed.event.id.value,replacement.revision.value,replacement.hash.value,codec.definition(replacement)) }
        finally { database.execute("ALTER TABLE calendar_definitions ENABLE TRIGGER trg_calendar_rules_definition") }
        database.update("INSERT INTO calendar_reminder_rules(event_id,definition_revision,rule_id,channel,offset_seconds) VALUES(?,?,?,?,?)",changed.event.id.value,replacement.revision.value,changed.rule.id.value,changed.rule.channel.wire,changed.rule.offsetSeconds)
        database.execute("ALTER TABLE calendar_events DISABLE TRIGGER trg_calendar_event")
        try { database.update("UPDATE calendar_events SET revision=?,definition_revision=?,snapshot=?::jsonb WHERE id=?",replacementEvent.revision.value,replacement.revision.value,codec.event(replacementEvent),changed.event.id.value) }
        finally { database.execute("ALTER TABLE calendar_events ENABLE TRIGGER trg_calendar_event") }
        assertSkipped(changed,CalendarOccurrenceTerminalReason.DEFINITION_CHANGED)

        val paused=third("Third paused"); recorded(repository.change(admin,request(paused.event,CalendarStep.Pause))); assertSkipped(paused,CalendarOccurrenceTerminalReason.EVENT_INELIGIBLE)
        val cancelled=third("Third cancelled"); recorded(repository.change(admin,request(cancelled.event,CalendarStep.Cancel))); assertSkipped(cancelled,CalendarOccurrenceTerminalReason.EVENT_INELIGIBLE)
        val completed=third("Third completed",offset=300,thirdAt={ _,event->event.definition.end.instant },endAfterStart=1)
        systemRecorded(repository.advance(requireNotNull(CalendarSystemCandidate.from(completed.event,completed.event.definition.end.instant))))
        assertSkipped(completed,CalendarOccurrenceTerminalReason.EVENT_INELIGIBLE)
        val resumed=third("Third resumed"); val pausedEvent=recorded(repository.change(admin,request(resumed.event,CalendarStep.Pause))).after; recorded(repository.change(admin,request(pausedEvent,CalendarStep.Resume))); assertSkipped(resumed,CalendarOccurrenceTerminalReason.RESUME_CUTOFF)
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_email_outbox",Int::class.java))
    }

    @Test fun `delivery lock wait crossing lease boundary loses fence without partial notification`() {
        val (url,database)=isolatedDatabase("handoff_lock_expiry"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        val rule=CalendarFixtures.rule(600); schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Blocked handoff",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
        val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single()
        val digest=java.security.MessageDigest.getInstance("SHA-256").digest("notification-delivery:${lease.occurrence.id.value}".toByteArray(Charsets.UTF_8))
        val lockKey=java.nio.ByteBuffer.wrap(digest).long
        val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(url,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false
            blocker.prepareStatement("SELECT pg_advisory_xact_lock(?)").use { statement -> statement.setLong(1,lockKey); statement.execute() }
            val future=pool.submit<CalendarOccurrenceHandoffResult> { CalendarOccurrenceHandoffService(repository).handoff(lease) }
            try {
                awaitDatabase { database.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%')",Boolean::class.java)!! }
                clock.instant=lease.leaseUntil
                blocker.commit()
                assertSame(CalendarOccurrenceHandoffResult.LostFence,future.get(15,TimeUnit.SECONDS))
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
        assertEquals("LEASED",database.queryForObject("SELECT state FROM calendar_reminder_occurrences WHERE id=?",String::class.java,lease.occurrence.id.value))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs",Int::class.java))
    }

    @Test fun `handoff lease boundary is half open and expired ownership can be taken over`() {
        listOf(-1L,0L,1L).forEach { delta ->
            val (url,database)=isolatedDatabase("handoff_boundary_${delta+1}"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
            val rule=CalendarFixtures.rule(600); schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Boundary $delta",rules=listOf(rule))))
            val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
            val worker=CalendarOccurrenceWorkerService(clock,repository)
            val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single()
            clock.instant=lease.leaseUntil.plusSeconds(delta)
            val result=CalendarOccurrenceHandoffService(repository).handoff(lease)
            if(delta<0) assertInstanceOf(CalendarOccurrenceHandoffResult.Emitted::class.java,result)
            else assertSame(CalendarOccurrenceHandoffResult.LostFence,result)
            assertEquals(if(delta<0) 1 else 0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
            if(delta>0) {
                val takeover=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single()
                assertEquals(2,takeover.token.attempt)
                assertSame(CalendarOccurrenceHandoffResult.LostFence,CalendarOccurrenceHandoffService(repository).handoff(lease))
            }
        }
    }

    @Test fun `notification projection failure rolls back alert source and occurrence handoff`() {
        val (url,database)=isolatedDatabase("handoff_rollback"); val clock=MutableCalendarClock(); val source=runtime(url); val jdbc=JdbcTemplate(source); val transactions=TransactionTemplate(DataSourceTransactionManager(source))
        val repository=handoffRepo(clock,jdbc,transactions,NotificationEmailIntentProjection { throw IllegalStateException("projection fixture failure") }); val admin=actor(database=database)
        val rule=CalendarFixtures.rule(600); schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Rollback handoff",rules=listOf(rule))))
        val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences",Timestamp::class.java)!!.toInstant(); forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
        val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single()
        assertThrows(IllegalStateException::class.java) { CalendarOccurrenceHandoffService(repository).handoff(lease) }
        assertEquals("LEASED",database.queryForObject("SELECT state FROM calendar_reminder_occurrences WHERE id=?",String::class.java,lease.occurrence.id.value))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs",Int::class.java))
    }

    @Test fun `every handoff write failure rolls back the whole transaction`() {
        val (url,database)=isolatedDatabase("handoff_write_failures"); val clock=MutableCalendarClock(); val repository=handoffRepo(clock,url); val admin=actor(database=database)
        database.execute("CREATE FUNCTION calendar_fixture_handoff_fail() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'} BEGIN RAISE EXCEPTION 'handoff fixture failure'; END ${'$'}${'$'}")
        database.execute("CREATE FUNCTION calendar_fixture_handoff_drop() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'} BEGIN RETURN NULL; END ${'$'}${'$'}")
        val targets=listOf(
            "BEFORE INSERT ON notification_alerts",
            "BEFORE INSERT ON notification_source_events",
            "BEFORE INSERT ON calendar_occurrence_handoffs",
            "BEFORE UPDATE ON calendar_reminder_occurrences",
        )
        try {
            targets.forEachIndexed { index,target ->
                clock.instant=CalendarFixtures.now
                val rule=CalendarFixtures.rule(600); val event=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Write rollback $index",rules=listOf(rule))))
                val occurrenceId=database.queryForObject("SELECT id FROM calendar_reminder_occurrences WHERE event_id=?",UUID::class.java,event.id.value)!!
                val due=database.queryForObject("SELECT scheduled_at FROM calendar_reminder_occurrences WHERE id=?",Timestamp::class.java,occurrenceId)!!.toInstant()
                forceSwitch(CalendarSwitchState.ENABLED,due.minusSeconds(1),due.plusSeconds(3600),database); clock.instant=due
                val lease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID())))).records.single { it.occurrence.id.value==occurrenceId }
                val fixtureFunction=if(target.startsWith("BEFORE UPDATE")) "calendar_fixture_handoff_drop" else "calendar_fixture_handoff_fail"
                database.execute("CREATE TRIGGER fixture_handoff_failure $target FOR EACH ROW EXECUTE FUNCTION $fixtureFunction()")
                try { assertThrows(DataAccessException::class.java) { CalendarOccurrenceHandoffService(repository).handoff(lease) } }
                finally { database.execute("DROP TRIGGER fixture_handoff_failure ON ${target.substringAfter(" ON ")}") }
                assertEquals("LEASED",database.queryForObject("SELECT state FROM calendar_reminder_occurrences WHERE id=?",String::class.java,occurrenceId))
                assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN' AND source_id=?",Int::class.java,occurrenceId.toString()))
                assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_source_events WHERE delivery_id=?",Int::class.java,occurrenceId))
                assertEquals(0,database.queryForObject("SELECT count(*) FROM calendar_occurrence_handoffs WHERE occurrence_id=?",Int::class.java,occurrenceId))
            }
        } finally { database.execute("DROP FUNCTION calendar_fixture_handoff_fail()"); database.execute("DROP FUNCTION calendar_fixture_handoff_drop()") }
    }

    @Test fun `occurrence claim leases retries fences stale owners and dies on third proven failure`() {
        val (url,database)=isolatedDatabase("lease"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database); val rule=CalendarFixtures.rule()
        val scheduled=schedule(repository,admin,create(repository,admin,listOf(rule)))
        val due=scheduled.definition.start.instant.minusSeconds(rule.offsetSeconds)
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        clock.instant=due
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        val worker=CalendarOccurrenceWorkerService(clock,repository)
        val first=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner))
        assertEquals(1,first.selected); assertEquals(1,first.leased); assertEquals(due,first.observedAt)
        val lease1=first.records.single(); assertEquals(1,lease1.token.attempt); assertEquals(due.plusSeconds(60),lease1.leaseUntil)

        clock.instant=due.plusSeconds(10)
        val retry1=assertInstanceOf(CalendarOccurrenceSettlementResult.RetryScheduled::class.java,worker.settleFailure(lease1.occurrence.id,lease1.token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF))
        assertEquals(clock.instant.plusSeconds(30),retry1.nextAttemptAt)
        assertSame(CalendarOccurrenceSettlementResult.LostFence,worker.settleFailure(lease1.occurrence.id,lease1.token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF))

        clock.instant=retry1.nextAttemptAt
        val lease2=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single()
        assertEquals(2,lease2.token.attempt)
        clock.instant=clock.instant.plusSeconds(10)
        val retry2=assertInstanceOf(CalendarOccurrenceSettlementResult.RetryScheduled::class.java,worker.settleFailure(lease2.occurrence.id,lease2.token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF))
        assertEquals(clock.instant.plusSeconds(120),retry2.nextAttemptAt)

        clock.instant=retry2.nextAttemptAt
        val lease3=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,worker.claim(owner)).records.single()
        assertEquals(3,lease3.token.attempt)
        clock.instant=clock.instant.plusSeconds(10)
        val dead=assertInstanceOf(CalendarOccurrenceSettlementResult.Dead::class.java,worker.settleFailure(lease3.occurrence.id,lease3.token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF))
        assertEquals(CalendarOccurrenceTerminalReason.ATTEMPTS_EXHAUSTED,dead.reason)
        assertEquals("DEAD",database.queryForObject("SELECT state FROM calendar_reminder_occurrences WHERE id=?",String::class.java,lease3.occurrence.id.value))
        assertInstanceOf(CalendarOccurrenceClaimResult.Empty::class.java,worker.claim(owner))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
    }

    @Test fun `occurrence no backfill skips disabled reenabled resumed and late work at exact boundaries`() {
        val (url,database)=isolatedDatabase("cutoff")
        fun scheduledOccurrence(title: String): Pair<CalendarEvent,CalendarReminderRule> {
            val repository=repo(url=url); val admin=actor(database=database); val rule=CalendarFixtures.rule()
            return schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title=title,rules=listOf(rule)))) to rule
        }
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!

        val (disabled,disabledRule)=scheduledOccurrence("Disabled")
        val disabledDue=disabled.definition.start.instant.minusSeconds(disabledRule.offsetSeconds)
        forceSwitch(CalendarSwitchState.DISABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        val disabledClock=MutableCalendarClock(disabledDue)
        val disabledPage=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(disabledClock,repo(disabledClock,url=url)).claim(owner))
        assertEquals(0,disabledPage.leased); assertEquals(1,disabledPage.skipped)

        val (expired,expiredRule)=scheduledOccurrence("Expired switch")
        val expiredDue=expired.definition.start.instant.minusSeconds(expiredRule.offsetSeconds)
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,expiredDue,database)
        val expiredClock=MutableCalendarClock(expiredDue)
        val expiredPage=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(expiredClock,repo(expiredClock,url=url)).claim(owner))
        assertEquals(1,expiredPage.skipped); assertEquals(0,expiredPage.leased)

        val (reenabled,reenabledRule)=scheduledOccurrence("Reenabled cutoff")
        val reenabledDue=reenabled.definition.start.instant.minusSeconds(reenabledRule.offsetSeconds)
        forceSwitch(CalendarSwitchState.ENABLED,reenabledDue,CalendarFixtures.now.plusSeconds(86_400),database)
        val cutoffClock=MutableCalendarClock(reenabledDue)
        val cutoff=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(cutoffClock,repo(cutoffClock,url=url)).claim(owner))
        assertEquals(1,cutoff.skipped)

        val resumeClock=MutableCalendarClock(); val resumeRepo=repo(resumeClock,url=url); val resumeAdmin=actor(database=database); val resumeRule=CalendarFixtures.rule()
        var resumed=schedule(resumeRepo,resumeAdmin,create(resumeRepo,resumeAdmin,CalendarFixtures.definition(title="Resume cutoff",rules=listOf(resumeRule))))
        val resumeDue=resumed.definition.start.instant.minusSeconds(resumeRule.offsetSeconds)
        resumeClock.instant=CalendarFixtures.now.plusSeconds(60); resumed=recorded(resumeRepo.change(resumeAdmin,request(resumed,CalendarStep.Pause))).after
        resumeClock.instant=resumeDue; resumed=recorded(resumeRepo.change(resumeAdmin,request(resumed,CalendarStep.Resume))).after
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        val resumedPage=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(resumeClock,resumeRepo).claim(owner))
        assertEquals(1,resumedPage.skipped); assertEquals(CalendarLifecycle.SCHEDULED,resumed.lifecycle)

        val (boundary,boundaryRule)=scheduledOccurrence("Lateness boundary")
        val boundaryDue=boundary.definition.start.instant.minusSeconds(boundaryRule.offsetSeconds)
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        val exactClock=MutableCalendarClock(boundaryDue.plusSeconds(900)); val exact=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(exactClock,repo(exactClock,url=url)).claim(owner))
        assertEquals(1,exact.leased)
        clock@ run {
            val (late,lateRule)=scheduledOccurrence("Late")
            val lateDue=late.definition.start.instant.minusSeconds(lateRule.offsetSeconds)
            val lateClock=MutableCalendarClock(lateDue.plusSeconds(901)); val page=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(lateClock,repo(lateClock,url=url)).claim(owner))
            assertEquals(1,page.skipped); assertEquals(0,page.leased)
        }
    }

    @Test fun `concurrent occurrence claimers are disjoint and a blocked claim grants a fresh lease`() {
        val (url,database)=isolatedDatabase("concurrent_claim"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database)
        val rules=listOf(CalendarFixtures.rule(300),CalendarFixtures.rule(600))
        val scheduled=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Concurrent occurrences",rules=rules)))
        val observedAt=scheduled.definition.start.instant.minusSeconds(300)
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        clock.instant=observedAt
        val barrier=CyclicBarrier(2); val pool=Executors.newFixedThreadPool(2)
        try {
            val pages=(1..2).map { pool.submit<CalendarOccurrenceClaimResult.Page> {
                val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
                barrier.await(10,TimeUnit.SECONDS)
                assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repo(clock,url=url)).claim(owner,CalendarOccurrenceBatchSize.from(1)!!))
            } }.map { it.get(20,TimeUnit.SECONDS) }
            assertTrue(pages.all { it.leased==1 && it.selected==1 })
            assertEquals(2,pages.flatMap { it.records }.map { it.occurrence.id }.distinct().size)
        } finally { pool.shutdownNow() }

        val lateRule=CalendarFixtures.rule(300); val blocked=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Blocked grant",start=CalendarFixtures.now.plusSeconds(7200),rules=listOf(lateRule))))
        val blockedDue=blocked.definition.start.instant.minusSeconds(lateRule.offsetSeconds)
        clock.instant=blockedDue
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!; val waitPool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(url,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false; blocker.createStatement().use { it.execute("LOCK TABLE calendar_reminder_switch IN ACCESS EXCLUSIVE MODE") }
            val future=waitPool.submit<CalendarOccurrenceClaimResult> { CalendarOccurrenceWorkerService(clock,repo(clock,url=url)).claim(owner,CalendarOccurrenceBatchSize.from(3)!!) }
            try {
                awaitDatabase { database.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%calendar_lock_reminder_switch%')",Boolean::class.java)!! }
                clock.instant=blockedDue.plusSeconds(120); blocker.commit()
                val page=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,future.get(20,TimeUnit.SECONDS))
                val lease=page.records.single()
                assertEquals(blockedDue,page.observedAt)
                assertEquals(blockedDue.plusSeconds(120),page.leaseGrantedAt)
                assertEquals(blockedDue.plusSeconds(180),lease.leaseUntil)
            } finally { blocker.rollback(); waitPool.shutdownNow() }
        }
    }

    @Test fun `expired occurrence leases recover with a new fence and third expiry is terminal`() {
        val (url,database)=isolatedDatabase("lease_recovery"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database)
        val rule=CalendarFixtures.rule(); val scheduled=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Lease recovery",rules=listOf(rule))))
        val due=scheduled.definition.start.instant.minusSeconds(rule.offsetSeconds)
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        val ownerA=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!; val ownerB=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        clock.instant=due
        val first=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(ownerA)).records.single()
        clock.instant=first.leaseUntil
        assertSame(CalendarOccurrenceSettlementResult.LostFence,CalendarOccurrenceWorkerService(clock,repository).settleFailure(first.occurrence.id,first.token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF))
        val second=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(ownerB)).records.single()
        assertEquals(2,second.token.attempt); assertNotEquals(first.token.owner,second.token.owner)
        clock.instant=second.leaseUntil
        assertSame(CalendarOccurrenceSettlementResult.LostFence,CalendarOccurrenceWorkerService(clock,repository).settleFailure(first.occurrence.id,first.token,CalendarOccurrenceFailureClass.PERMANENT_PRE_HANDOFF))
        val third=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(ownerB)).records.single()
        assertEquals(3,third.token.attempt)
        clock.instant=third.leaseUntil
        forceSwitch(CalendarSwitchState.DISABLED,clock.instant,clock.instant.plusSeconds(3600),database)
        val exhausted=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(ownerA))
        assertEquals(1,exhausted.dead); assertEquals(0,exhausted.leased); assertTrue(exhausted.records.isEmpty())
        assertEquals("ATTEMPTS_EXHAUSTED",database.queryForObject("SELECT terminal_reason FROM calendar_reminder_occurrences WHERE id=?",String::class.java,third.occurrence.id.value))

        val permanentRule=CalendarFixtures.rule(); val permanent=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Permanent failure",start=CalendarFixtures.now.plusSeconds(7200),rules=listOf(permanentRule))))
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        clock.instant=permanent.definition.start.instant.minusSeconds(permanentRule.offsetSeconds)
        val permanentLease=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(ownerA)).records.single()
        clock.instant=clock.instant.plusSeconds(1)
        val dead=assertInstanceOf(CalendarOccurrenceSettlementResult.Dead::class.java,CalendarOccurrenceWorkerService(clock,repository).settleFailure(permanentLease.occurrence.id,permanentLease.token,CalendarOccurrenceFailureClass.PERMANENT_PRE_HANDOFF))
        assertEquals(CalendarOccurrenceTerminalReason.PERMANENT_FAILURE,dead.reason)
    }

    @Test fun `corrupt switch rolls back the whole occurrence claim page`() {
        val (url,database)=isolatedDatabase("corrupt_claim"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database)
        val rules=listOf(CalendarFixtures.rule(300),CalendarFixtures.rule(600)); val scheduled=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Corrupt page",rules=rules)))
        val due=scheduled.definition.start.instant.minusSeconds(300)
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        database.execute("ALTER TABLE calendar_reminder_switch DROP CONSTRAINT ck_calendar_reminder_switch_governance")
        database.execute("ALTER TABLE calendar_reminder_switch DISABLE TRIGGER trg_calendar_protect_reminder_switch")
        try { database.update("UPDATE calendar_reminder_switch SET affected_action='FUTURE' WHERE id=1") }
        finally { database.execute("ALTER TABLE calendar_reminder_switch ENABLE TRIGGER trg_calendar_protect_reminder_switch") }
        clock.instant=due
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        assertSame(CalendarOccurrenceClaimResult.Corrupt,CalendarOccurrenceWorkerService(clock,repository).claim(owner))
        val states=database.queryForList("SELECT state FROM calendar_reminder_occurrences ORDER BY scheduled_at",String::class.java)
        assertEquals(listOf("PENDING","PENDING"),states)
        assertTrue(database.queryForList("SELECT lease_owner FROM calendar_reminder_occurrences").all { it["lease_owner"]==null })
    }

    @Test fun `claim propagates lock infrastructure failure and rolls back instead of reporting corrupt`() {
        val (url,database)=isolatedDatabase("claim_timeout"); val clock=MutableCalendarClock(); val setup=repo(clock,url=url); val admin=actor(database=database); val rule=CalendarFixtures.rule()
        val scheduled=schedule(setup,admin,create(setup,admin,CalendarFixtures.definition(title="Timeout",rules=listOf(rule))))
        val due=scheduled.definition.start.instant.minusSeconds(rule.offsetSeconds); clock.instant=due
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        DriverManagerDataSource(url,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false; blocker.createStatement().use { it.execute("LOCK TABLE calendar_reminder_switch IN ACCESS EXCLUSIVE MODE") }
            runtime(url).connection.use { workerConnection ->
                workerConnection.createStatement().use { it.execute("SET lock_timeout='100ms'") }
                assertThrows(DataAccessException::class.java) { CalendarOccurrenceWorkerService(clock,repo(workerConnection,clock)).claim(owner) }
            }
            blocker.rollback()
        }
        assertEquals("PENDING",database.queryForObject("SELECT state FROM calendar_reminder_occurrences",String::class.java))
    }

    @Test fun `latest resume cutoff is chosen by aggregate revision not inverted timestamps`() {
        val (url,database)=isolatedDatabase("resume_revision"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database); val rule=CalendarFixtures.rule()
        var event=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Resume ordering",rules=listOf(rule))))
        val due=event.definition.start.instant.minusSeconds(rule.offsetSeconds)
        clock.instant=CalendarFixtures.now.plusSeconds(10); event=recorded(repository.change(admin,request(event,CalendarStep.Pause))).after
        clock.instant=CalendarFixtures.now.plusSeconds(20); val firstResume=recorded(repository.change(admin,request(event,CalendarStep.Resume))); event=firstResume.after
        clock.instant=CalendarFixtures.now.plusSeconds(30); event=recorded(repository.change(admin,request(event,CalendarStep.Pause))).after
        clock.instant=CalendarFixtures.now.plusSeconds(40); val secondResume=recorded(repository.change(admin,request(event,CalendarStep.Resume))); event=secondResume.after
        assertTrue(secondResume.after.revision.value>firstResume.after.revision.value)
        database.execute("ALTER TABLE calendar_command_receipts DISABLE TRIGGER trg_calendar_receipts_immutable")
        try { database.update("UPDATE calendar_command_receipts SET recorded_at=? WHERE command_id=?",Timestamp.from(due.plusSeconds(1)),firstResume.commandId.value) }
        finally { database.execute("ALTER TABLE calendar_command_receipts ENABLE TRIGGER trg_calendar_receipts_immutable") }
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        clock.instant=due.plusSeconds(2)
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        val page=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(owner))
        assertEquals(1,page.leased); assertEquals(0,page.skipped); assertEquals(CalendarLifecycle.SCHEDULED,event.lifecycle)
    }

    @Test fun `claim page cap preserves scheduled order and settlement enforces both lease boundaries`() {
        val (url,database)=isolatedDatabase("cap_boundaries"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database)
        val rules=listOf(CalendarFixtures.rule(300),CalendarFixtures.rule(900),CalendarFixtures.rule(600))
        val scheduled=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Ordered cap",rules=rules)))
        val observed=scheduled.definition.start.instant.minusSeconds(300); clock.instant=observed
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        val capped=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(owner,CalendarOccurrenceBatchSize.from(2)!!))
        assertEquals(2,capped.selected); assertEquals(listOf(rules[1].id,rules[2].id),capped.records.map { it.occurrence.ruleId })
        val finalPage=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(owner,CalendarOccurrenceBatchSize.from(1)!!))
        assertEquals(rules[0].id,finalPage.records.single().occurrence.ruleId)

        val all=capped.records+finalPage.records
        assertSame(CalendarOccurrenceSettlementResult.LostFence,repository.settleFailure(all[0].occurrence.id,all[0].token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF,capped.leaseGrantedAt.minusSeconds(1)))
        assertInstanceOf(CalendarOccurrenceSettlementResult.RetryScheduled::class.java,repository.settleFailure(all[1].occurrence.id,all[1].token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF,all[1].leaseUntil.minusSeconds(1)))
        assertSame(CalendarOccurrenceSettlementResult.LostFence,repository.settleFailure(all[2].occurrence.id,all[2].token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF,finalPage.records.single().leaseUntil.plusSeconds(1)))
    }

    @Test fun `paused cancelled completed and changed definition occurrences are terminal without notification`() {
        val (url,database)=isolatedDatabase("ineligible"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database)
        fun scheduled(title: String,start: Instant=CalendarFixtures.now.plusSeconds(3600),end: Instant=start.plusSeconds(7200)): Pair<CalendarEvent,CalendarReminderRule> {
            val rule=CalendarFixtures.rule(); return schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title=title,start=start,end=end,rules=listOf(rule)))) to rule
        }
        var (paused,pausedRule)=scheduled("Paused"); var (cancelled,cancelledRule)=scheduled("Cancelled")
        val (completeCandidate,completeRule)=scheduled("Completed",end=CalendarFixtures.now.plusSeconds(3660))
        clock.instant=CalendarFixtures.now.plusSeconds(60)
        paused=recorded(repository.change(admin,request(paused,CalendarStep.Pause))).after
        cancelled=recorded(repository.change(admin,request(cancelled,CalendarStep.Cancel))).after
        val completeAt=completeCandidate.definition.end.instant
        assertEquals(CalendarOutcome.APPLIED,systemRecorded(repository.advance(CalendarSystemCandidate.from(completeCandidate,completeAt)!!)).receipt.outcome)
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        clock.instant=completeAt
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        val terminal=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(owner,CalendarOccurrenceBatchSize.from(3)!!))
        assertEquals(3,terminal.skipped); assertEquals(0,terminal.leased)
        assertEquals(setOf("EVENT_INELIGIBLE"),database.queryForList("SELECT terminal_reason FROM calendar_reminder_occurrences WHERE rule_id IN (?,?,?)",String::class.java,pausedRule.id.value,cancelledRule.id.value,completeRule.id.value).toSet())

        val (changed,changedRule)=scheduled("Definition changed",CalendarFixtures.now.plusSeconds(7200),CalendarFixtures.now.plusSeconds(9000))
        val replacement=CalendarFixtures.definition(1,"Replacement",changed.definition.start.instant,changed.definition.end.instant,listOf(changedRule))
        val replacementEvent=CalendarEvent.restore(changed.id,changed.revision.next()!!,CalendarLifecycle.SCHEDULED,replacement,replacement.revision,changed.createdAt)!!
        val codec=CalendarSnapshotCodec(jacksonObjectMapper(),CalendarFixtures.hasher)
        database.execute("ALTER TABLE calendar_definitions DISABLE TRIGGER trg_calendar_rules_definition")
        try { database.update("INSERT INTO calendar_definitions(event_id,definition_revision,definition_hash,snapshot) VALUES(?,?,?,?::jsonb)",changed.id.value,replacement.revision.value,replacement.hash.value,codec.definition(replacement)) }
        finally { database.execute("ALTER TABLE calendar_definitions ENABLE TRIGGER trg_calendar_rules_definition") }
        database.update("INSERT INTO calendar_reminder_rules(event_id,definition_revision,rule_id,channel,offset_seconds) VALUES(?,?,?,?,?)",changed.id.value,replacement.revision.value,changedRule.id.value,changedRule.channel.wire,changedRule.offsetSeconds)
        database.execute("ALTER TABLE calendar_events DISABLE TRIGGER trg_calendar_event")
        try { database.update("UPDATE calendar_events SET revision=?,definition_revision=?,snapshot=?::jsonb WHERE id=?",replacementEvent.revision.value,replacement.revision.value,codec.event(replacementEvent),changed.id.value) }
        finally { database.execute("ALTER TABLE calendar_events ENABLE TRIGGER trg_calendar_event") }
        clock.instant=changed.definition.start.instant.minusSeconds(changedRule.offsetSeconds)
        val changedPage=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,repository).claim(owner))
        assertEquals(1,changedPage.skipped); assertEquals("DEFINITION_CHANGED",database.queryForObject("SELECT terminal_reason FROM calendar_reminder_occurrences WHERE rule_id=?",String::class.java,changedRule.id.value))
        assertEquals(0,database.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertEquals(CalendarLifecycle.PAUSED,paused.lifecycle); assertEquals(CalendarLifecycle.CANCELLED,cancelled.lifecycle)
    }

    @Test fun `later canonical event corruption and pending metadata corruption rollback before any page mutation`() {
        val (url,database)=isolatedDatabase("page_corruption"); val clock=MutableCalendarClock(); val repository=repo(clock,url=url); val admin=actor(database=database)
        val firstRule=CalendarFixtures.rule(600); val secondRule=CalendarFixtures.rule(300)
        schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Valid first",rules=listOf(firstRule))))
        val corruptEvent=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Corrupt second",rules=listOf(secondRule))))
        val alteredDefinition=CalendarFixtures.definition(0,"Canonical mismatch",corruptEvent.definition.start.instant,corruptEvent.definition.end.instant,listOf(secondRule))
        val alteredEvent=CalendarEvent.restore(corruptEvent.id,corruptEvent.revision,corruptEvent.lifecycle,alteredDefinition,corruptEvent.approvedDefinitionRevision,corruptEvent.createdAt)!!
        val codec=CalendarSnapshotCodec(jacksonObjectMapper(),CalendarFixtures.hasher)
        database.execute("ALTER TABLE calendar_events DISABLE TRIGGER trg_calendar_event")
        database.execute("ALTER TABLE calendar_events DISABLE TRIGGER trg_calendar_definition_consistency")
        try { database.update("UPDATE calendar_events SET snapshot=?::jsonb WHERE id=?",codec.event(alteredEvent),corruptEvent.id.value) }
        finally {
            database.execute("ALTER TABLE calendar_events ENABLE TRIGGER trg_calendar_definition_consistency")
            database.execute("ALTER TABLE calendar_events ENABLE TRIGGER trg_calendar_event")
        }
        forceSwitch(CalendarSwitchState.DISABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),database)
        clock.instant=corruptEvent.definition.start.instant.minusSeconds(300)
        val owner=CalendarLeaseOwner.fromWire(UUID.randomUUID())!!
        assertSame(CalendarOccurrenceClaimResult.Corrupt,CalendarOccurrenceWorkerService(clock,repository).claim(owner,CalendarOccurrenceBatchSize.from(2)!!))
        assertEquals(listOf("PENDING","PENDING"),database.queryForList("SELECT state FROM calendar_reminder_occurrences ORDER BY scheduled_at",String::class.java))

        val (metadataUrl,metadataDb)=isolatedDatabase("pending_metadata"); val metadataClock=MutableCalendarClock(); val metadataRepo=repo(metadataClock,url=metadataUrl); val metadataAdmin=actor(database=metadataDb); val metadataRule=CalendarFixtures.rule()
        val metadataEvent=schedule(metadataRepo,metadataAdmin,create(metadataRepo,metadataAdmin,CalendarFixtures.definition(title="Pending metadata",rules=listOf(metadataRule))))
        metadataDb.execute("ALTER TABLE calendar_reminder_occurrences DROP CONSTRAINT ck_calendar_occurrence_worker_shape")
        metadataDb.execute("ALTER TABLE calendar_reminder_occurrences DISABLE TRIGGER trg_calendar_occurrence_worker")
        try { metadataDb.update("UPDATE calendar_reminder_occurrences SET terminal_reason='LATE',terminal_at=scheduled_at WHERE rule_id=?",metadataRule.id.value) }
        finally { metadataDb.execute("ALTER TABLE calendar_reminder_occurrences ENABLE TRIGGER trg_calendar_occurrence_worker") }
        forceSwitch(CalendarSwitchState.ENABLED,CalendarFixtures.now,CalendarFixtures.now.plusSeconds(86_400),metadataDb)
        metadataClock.instant=metadataEvent.definition.start.instant.minusSeconds(metadataRule.offsetSeconds)
        assertSame(CalendarOccurrenceClaimResult.Corrupt,CalendarOccurrenceWorkerService(metadataClock,metadataRepo).claim(owner))
        assertEquals("PENDING",metadataDb.queryForObject("SELECT state FROM calendar_reminder_occurrences",String::class.java))
    }
    @Test fun `create retries allocate once and immutable historical receipt survives later definition and lifecycle changes`() {
        val clock=MutableCalendarClock(); val repository=repo(clock); val admin=actor()
        val ids=object: CalendarIds {
            var events=0; private val delegate=RandomCalendarIds()
            override fun event()=delegate.event().also { events++ }; override fun preflight()=delegate.preflight(); override fun occurrence()=delegate.occurrence()
        }
        val tracking=repo(clock,ids); val create=CalendarCreateRequest(CalendarFixtures.command(),CalendarFixtures.definition())
        val first=recorded(tracking.create(admin,create)); val replay=recorded(tracking.create(admin,create))
        assertEquals(first.eventId,replay.eventId); assertEquals(1,ids.events)
        val edited=recorded(repository.change(admin,request(first.after,CalendarStep.Edit,definition=CalendarFixtures.definition(1,"New definition")))).after
        val scheduled=schedule(repository,admin,edited)
        clock.instant=scheduled.definition.end.instant.plusSeconds(86400)
        val original=recorded(repository.receipt(admin,create.commandId))
        assertEquals(CalendarLifecycle.DRAFT,original.after.lifecycle); assertEquals(CalendarRevision.Zero,original.after.revision); assertEquals(first.after.definition.hash,original.after.definition.hash)
        assertEquals(first.eventId,recorded(tracking.create(admin,create)).eventId); assertEquals(1,ids.events)
        assertEquals(CalendarPersistenceResult.IdempotencyConflict,tracking.create(admin,create.copy(definition=CalendarFixtures.definition(title="Changed payload"))))
        assertEquals(CalendarPersistenceResult.IdempotencyConflict,tracking.create(actor(),create))
    }
    @Test fun `preflight has durable command identity revision binding expiry and globally scoped conflicts`() {
        val clock=MutableCalendarClock(); val repository=repo(clock); val admin=actor(); val event=create(repository,admin)
        val command=CalendarPreflightRequest(CalendarFixtures.command(),event.id,event.revision)
        val first=assertInstanceOf(CalendarPreflightResult.Recorded::class.java,repository.preflight(admin,command))
        clock.instant=clock.instant.plusSeconds(601)
        val retry=assertInstanceOf(CalendarPreflightResult.Recorded::class.java,repository.preflight(admin,command))
        assertEquals(first.preflight!!.id,retry.preflight!!.id); assertEquals(first.preflight!!.expiresAt,retry.preflight!!.expiresAt)
        assertEquals(CalendarOutcome.PREFLIGHT_EXPIRED,recorded(repository.change(admin,request(event,CalendarStep.Schedule,preflight=first.preflight!!.id))).outcome)
        assertEquals(CalendarPreflightResult.IdempotencyConflict,repository.preflight(admin,command.copy(expectedRevision=CalendarRevision.fromWire(1)!!)))
        assertEquals(CalendarPersistenceResult.IdempotencyConflict,repository.change(admin,request(event,CalendarStep.Cancel,id=command.commandId)))
        val edited=recorded(repository.change(admin,request(event,CalendarStep.Edit,definition=CalendarFixtures.definition(1)))).after
        assertEquals(CalendarOutcome.PREFLIGHT_STALE,recorded(repository.change(admin,request(edited,CalendarStep.Schedule,preflight=first.preflight!!.id))).outcome)
        val conflict=assertInstanceOf(CalendarPreflightResult.Recorded::class.java,repository.preflight(admin,command.copy(commandId=CalendarFixtures.command())))
        assertEquals(CalendarOutcome.REVISION_CONFLICT,conflict.outcome); assertNull(conflict.preflight)
    }
    @Test fun `competing aggregate revisions serialize with one applied command and one recorded CAS rejection`() {
        val repository=repo(); val admin=actor(); val event=create(repository,admin); val barrier=CyclicBarrier(2); val pool=Executors.newFixedThreadPool(2)
        try {
            val tasks=listOf(CalendarStep.Cancel,CalendarStep.Edit).map { step -> Callable {
                barrier.await(10,TimeUnit.SECONDS)
                recorded(repo().change(admin,request(event,step,definition=if(step==CalendarStep.Edit) CalendarFixtures.definition(1) else null)))
            } }
            val receipts=pool.invokeAll(tasks).map { it.get(30,TimeUnit.SECONDS) }
            assertEquals(1,receipts.count { it.outcome==CalendarOutcome.APPLIED }); assertEquals(1,receipts.count { it.outcome==CalendarOutcome.REVISION_CONFLICT })
            assertEquals(1L,repository.find(event.id)!!.revision.value)
            assertEquals(3,repository.audit(admin,event.id)!!.size)
            receipts.forEach { receipt -> assertEquals(receipt.outcome,recorded(repository.receipt(admin,receipt.commandId,event.id)).outcome) }
        } finally { pool.shutdownNow() }
    }
    @Test fun `schedule creates stable unique occurrences but no claim switch activation notification or external delivery`() {
        val clock=MutableCalendarClock(); val repository=repo(clock); val admin=actor(); val event=create(repository,admin,listOf(CalendarFixtures.rule(300),CalendarFixtures.rule(600)))
        val scheduled=schedule(repository,admin,event)
        val before=root.queryForList("SELECT * FROM calendar_reminder_occurrences WHERE event_id=? ORDER BY rule_id",event.id.value)
        assertEquals(2,before.size); assertTrue(before.all { it["state"]==CalendarOccurrenceState.PENDING.wire && (it["attempts"] as Number).toInt()==0 && it["lease_owner"]==null })
        val paused=recorded(repository.change(admin,request(scheduled,CalendarStep.Pause))).after
        clock.instant=event.definition.start.instant.plusSeconds(1)
        val resumed=recorded(repository.change(admin,request(paused,CalendarStep.Resume))).after
        assertEquals(CalendarLifecycle.ACTIVE,resumed.lifecycle)
        assertEquals(before,root.queryForList("SELECT * FROM calendar_reminder_occurrences WHERE event_id=? ORDER BY rule_id",event.id.value))
        assertEquals(CalendarSwitchState.DISABLED,repository.reminderSwitch().state)
        assertEquals(0,root.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
        assertThrows(DataAccessException::class.java) { root.update("INSERT INTO calendar_reminder_occurrences SELECT ?,event_id,approved_definition_revision,rule_id,scheduled_at,state,attempts,lease_owner,lease_until FROM calendar_reminder_occurrences WHERE id=?",UUID.randomUUID(),before[0]["id"]) }
    }
    @Test fun `live role session and original actor are checked again for commands recovery and preflight`() {
        val repository=repo(); val admin=actor(); val operator=actor(InternalRole.OPERATOR); val foreign=actor(); val event=create(repository,admin)
        val command=request(event,CalendarStep.Cancel)
        assertNull(CalendarSystemCandidate.from(event,event.definition.start.instant))
        recorded(repository.change(admin,command))
        assertEquals(CalendarPersistenceResult.Unauthorized,repository.change(operator,command))
        assertEquals(CalendarPersistenceResult.Missing,repository.receipt(foreign,command.commandId,event.id))
        assertEquals(CalendarPreflightResult.Unauthorized,repository.preflight(operator,CalendarPreflightRequest(CalendarFixtures.command(),event.id,event.revision)))
        assertEquals(CalendarPersistenceResult.Unknown,repository.change(admin,request(event,CalendarStep.Activate)))
        root.update("UPDATE identity_sessions SET revoked_at=issued_at+interval '1 second',revocation_kind='SELF',revoked_by_user_id=?,revocation_correlation_id=?,revoked_reason='Fixture' WHERE id=?",admin.userId,UUID.randomUUID(),admin.sessionId)
        assertEquals(CalendarPersistenceResult.Unauthorized,repository.change(admin,command)); assertEquals(CalendarPersistenceResult.Unauthorized,repository.receipt(admin,command.commandId))
    }
    @Test fun `session expiring behind preflight lock cannot schedule or persist a receipt`() {
        val repository=repo(); val admin=actor(); val event=create(repository,admin); val approved=preflight(repository,admin,event)
        val expiring=shortSession(admin); val command=request(event,CalendarStep.Schedule,preflight=approved.id); val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false
            blocker.prepareStatement("SELECT id FROM calendar_preflights WHERE id=? FOR UPDATE").use { it.setObject(1,approved.id.value); it.execute() }
            val result=pool.submit<CalendarPersistenceResult> { repository.change(expiring,command) }
            try {
                awaitDatabase { root.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%calendar_lock_preflight%')",Boolean::class.java)!! }
                awaitExpiry(expiring); blocker.commit()
                assertEquals(CalendarPersistenceResult.Unauthorized,result.get(10,TimeUnit.SECONDS))
                assertEquals(CalendarLifecycle.DRAFT,repository.find(event.id)!!.lifecycle)
                assertEquals(0,root.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE command_id=?",Int::class.java,command.commandId.value))
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
    }
    @Test fun `temporary table shadowing cannot bypass occurrence validation`() {
        val repository=repo(); val admin=actor(); val rule=CalendarFixtures.rule(300); val scheduled=schedule(repository,admin,create(repository,admin,listOf(rule)))
        runtime().connection.use { connection ->
            connection.autoCommit=false
            try {
                connection.createStatement().use { statement ->
                    statement.execute("CREATE TEMP TABLE calendar_events AS TABLE public.calendar_events")
                    statement.execute("CREATE TEMP TABLE calendar_definitions AS TABLE public.calendar_definitions")
                    statement.execute("CREATE TEMP TABLE calendar_reminder_rules AS TABLE public.calendar_reminder_rules")
                    statement.execute("UPDATE calendar_reminder_rules SET offset_seconds=301 WHERE event_id='${scheduled.id.value}'")
                }
                val sql="""INSERT INTO public.calendar_reminder_occurrences(id,event_id,approved_definition_revision,rule_id,scheduled_at,state)
                    VALUES(?,?,?,?,?,'PENDING')"""
                assertThrows(java.sql.SQLException::class.java) {
                    connection.prepareStatement(sql).use { statement ->
                        statement.setObject(1,UUID.randomUUID()); statement.setObject(2,scheduled.id.value)
                        statement.setLong(3,scheduled.approvedDefinitionRevision!!.value); statement.setObject(4,rule.id.value)
                        statement.setObject(5,java.sql.Timestamp.from(scheduled.definition.start.instant.minusSeconds(301))); statement.executeUpdate()
                    }
                }
            } finally { connection.rollback() }
        }
    }
    @Test fun `receipt binding result validation and audit failure are fail closed and atomic`() {
        val repository=repo(); val admin=actor(); val event=create(repository,admin); val snapshot=root.queryForObject("SELECT snapshot::text FROM calendar_events WHERE id=?",String::class.java,event.id.value)!!
        fun bind(command: UUID,hash: String,eventId: CalendarEventId=event.id) { root.update("INSERT INTO calendar_command_bindings(command_id,family,actor_id,event_id,payload_hash) VALUES(?,'EVENT',?,?,?)",command,admin.userId,eventId.value,hash) }
        val mismatch=UUID.randomUUID(); bind(mismatch,"a".repeat(64))
        assertThrows(DataAccessException::class.java) {
            root.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
                VALUES(?,?,?,'CANCEL',1,'Fixture receipt',?,'REVISION_CONFLICT',?::jsonb,?::jsonb,clock_timestamp())""",mismatch,event.id.value,admin.userId,"b".repeat(64),snapshot,snapshot)
        }
        val exhaustion=UUID.randomUUID(); bind(exhaustion,"c".repeat(64))
        assertThrows(DataAccessException::class.java) {
            root.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
                VALUES(?,?,?,'CANCEL',0,'Fixture receipt',?,'REVISION_EXHAUSTED',?::jsonb,?::jsonb,clock_timestamp())""",exhaustion,event.id.value,admin.userId,"c".repeat(64),snapshot,snapshot)
        }
        val forged=UUID.randomUUID(); bind(forged,"f".repeat(64))
        assertThrows(DataAccessException::class.java) {
            root.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
                VALUES(?,?,?,'CANCEL',1,'Fixture receipt',?,'REVISION_CONFLICT',?::jsonb,?::jsonb,clock_timestamp())""",forged,event.id.value,admin.userId,"f".repeat(64),snapshot,snapshot)
        }
        val corrupt=UUID.randomUUID(); bind(corrupt,"d".repeat(64))
        val canonicalCancel=CalendarFixtures.hasher.hash(listOf("calendar-command-v1",admin.userId.toString(),event.id.value.toString(),CalendarOperation.CANCEL.wire,"1","Fixture receipt","","")).value
        root.execute("ALTER TABLE calendar_command_receipts DISABLE TRIGGER trg_calendar_receipt_binding_consistency")
        try {
            root.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
                VALUES(?,?,?,'CANCEL',1,'Fixture receipt',?,'REVISION_CONFLICT',?::jsonb,?::jsonb,clock_timestamp())""",corrupt,event.id.value,admin.userId,canonicalCancel,snapshot,snapshot)
        } finally { root.execute("ALTER TABLE calendar_command_receipts ENABLE TRIGGER trg_calendar_receipt_binding_consistency") }
        assertThrows(RuntimeException::class.java) { repository.receipt(admin,requireNotNull(CalendarCommandId.fromWire(corrupt)),event.id) }
        val validRow=root.queryForMap("""SELECT r.*,b.family AS binding_family,b.actor_id AS binding_actor_id,b.event_id AS binding_event_id,b.payload_hash AS binding_payload_hash
            FROM calendar_command_receipts r JOIN calendar_command_bindings b USING(command_id) WHERE r.event_id=? AND r.operation='CREATE'""",event.id.value)
        val forgedRow=HashMap(validRow).apply { this["payload_hash"]="9".repeat(64); this["binding_payload_hash"]="9".repeat(64) }
        val decode=JdbcCalendarPersistence::class.java.getDeclaredMethod("decodeReceipt",Map::class.java).apply { isAccessible=true }
        val invocation=assertThrows(java.lang.reflect.InvocationTargetException::class.java) { decode.invoke(repository,forgedRow) }
        assertInstanceOf(IllegalArgumentException::class.java,invocation.cause)

        val editEvent=create(repository,admin)
        val definitionA=CalendarFixtures.definition(1,"Requested definition")
        val editA=recorded(repository.change(admin,request(editEvent,CalendarStep.Edit,definition=definitionA)))
        val definitionB=CalendarFixtures.definition(2,"Different applied definition")
        val editB=recorded(repository.change(admin,request(editA.after,CalendarStep.Edit,definition=definitionB)))
        val editBRow=root.queryForMap("""SELECT r.*,b.family AS binding_family,b.actor_id AS binding_actor_id,b.event_id AS binding_event_id,b.payload_hash AS binding_payload_hash
            FROM calendar_command_receipts r JOIN calendar_command_bindings b USING(command_id) WHERE r.command_id=?""",editB.commandId.value)
        val forgedEditCommand=UUID.randomUUID()
        val forgedEditPayload=CalendarFixtures.hasher.hash(listOf("calendar-command-v1",admin.userId.toString(),editEvent.id.value.toString(),CalendarOperation.EDIT.wire,
            editA.after.revision.value.toString(),CalendarFixtures.reason.value,definitionA.hash.value,"")).value
        bind(forgedEditCommand,forgedEditPayload,editEvent.id)
        val forgedEditError=assertThrows(DataAccessException::class.java) {
            root.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,requested_definition_hash,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
                VALUES(?,?,?,'EDIT',?,?,?,?,'APPLIED',?::jsonb,?::jsonb,?)""",forgedEditCommand,editEvent.id.value,admin.userId,editA.after.revision.value,
                CalendarFixtures.reason.value,definitionA.hash.value,forgedEditPayload,editBRow["before_snapshot"].toString(),editBRow["after_snapshot"].toString(),editBRow["recorded_at"])
        }
        assertTrue(forgedEditError.mostSpecificCause.message!!.contains("ck_calendar_receipt_applied_transition"))
        val forgedEditRow=HashMap(editBRow).apply {
            this["requested_definition_hash"]=definitionA.hash.value
            this["payload_hash"]=forgedEditPayload
            this["binding_payload_hash"]=forgedEditPayload
        }
        val forgedEditInvocation=assertThrows(java.lang.reflect.InvocationTargetException::class.java) { decode.invoke(repository,forgedEditRow) }
        assertInstanceOf(IllegalArgumentException::class.java,forgedEditInvocation.cause)

        val atomicEvent=create(repository,admin); val atomic=request(atomicEvent,CalendarStep.Cancel)
        root.execute("CREATE FUNCTION calendar_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'} BEGIN RAISE EXCEPTION 'fixture failure'; END ${'$'}${'$'}")
        root.execute("CREATE TRIGGER calendar_fixture_audit BEFORE INSERT ON calendar_audit FOR EACH ROW EXECUTE FUNCTION calendar_fixture_fail()")
        try {
            assertThrows(DataAccessException::class.java) { repository.change(admin,atomic) }
            assertEquals(CalendarRevision.Zero,repository.find(atomicEvent.id)!!.revision)
            assertEquals(0,root.queryForObject("SELECT count(*) FROM calendar_command_bindings WHERE command_id=?",Int::class.java,atomic.commandId.value))
            assertEquals(0,root.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE command_id=?",Int::class.java,atomic.commandId.value))
        } finally {
            root.execute("DROP TRIGGER calendar_fixture_audit ON calendar_audit"); root.execute("DROP FUNCTION calendar_fixture_fail()")
        }
    }
    @Test fun `system boundaries are deterministic internal receipts and audit plus definitions are append only`() {
        val clock=MutableCalendarClock(); val repository=repo(clock); val admin=actor(); val scheduled=schedule(repository,admin,create(repository,admin,listOf(CalendarFixtures.rule())))
        clock.instant=scheduled.definition.end.instant
        val candidate=requireNotNull(CalendarSystemCandidate.from(scheduled,clock.instant))
        val completeResult=systemRecorded(repository.advance(candidate)); val complete=completeResult.receipt
        assertEquals(CalendarSystemReceiptDisposition.NEW,completeResult.disposition)
        assertNull(complete.actorId); assertEquals(CalendarLifecycle.COMPLETED,complete.after.lifecycle)
        clock.instant=clock.instant.plusSeconds(86400)
        val retryResult=systemRecorded(repository.advance(candidate)); val retry=retryResult.receipt
        assertEquals(CalendarSystemReceiptDisposition.REPLAY,retryResult.disposition)
        assertEquals(complete.commandId,retry.commandId); assertEquals(complete.recordedAt,retry.recordedAt)
        assertEquals(CalendarPersistenceResult.Missing,repository.receipt(admin,complete.commandId))
        for(table in listOf("calendar_definitions","calendar_reminder_rules","calendar_preflights","calendar_command_bindings","calendar_preflight_requests","calendar_command_receipts","calendar_audit")) {
            assertThrows(DataAccessException::class.java) { root.update("DELETE FROM $table") }
        }
        assertThrows(DataAccessException::class.java) { root.update("DELETE FROM calendar_events WHERE id=?",scheduled.id.value) }
        assertThrows(DataAccessException::class.java) { root.update("UPDATE calendar_events SET snapshot=jsonb_set(snapshot,'{definition,title}','\"tampered\"') WHERE id=?",scheduled.id.value) }
        assertNull(CalendarSystemCandidate.from(complete.after,complete.after.definition.start.instant))
    }
    @Test fun `system selection is bounded completion first and a missed window completes without activation`() {
        val repository=repo(); val admin=actor()
        val completes=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Complete first",start=CalendarFixtures.now.plusSeconds(300),end=CalendarFixtures.now.plusSeconds(600))))
        val activates=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Activate second",start=CalendarFixtures.now.plusSeconds(600),end=CalendarFixtures.now.plusSeconds(1200))))
        val observedAt=CalendarFixtures.now.plusSeconds(600)
        val one=assertInstanceOf(CalendarSystemSelectionResult.Page::class.java,repository.select(observedAt,requireNotNull(CalendarSystemBatchSize.from(1))))
        assertEquals(1,one.candidates.size); assertEquals(completes.id,one.candidates.single().eventId); assertEquals(CalendarOperation.SYSTEM_COMPLETE,one.candidates.single().operation)
        val page=assertInstanceOf(CalendarSystemSelectionResult.Page::class.java,repository.select(observedAt,requireNotNull(CalendarSystemBatchSize.from(2))))
        assertEquals(listOf(completes.id,activates.id),page.candidates.map { it.eventId })
        val completed=systemRecorded(repository.advance(page.candidates.first()))
        assertEquals(CalendarSystemReceiptDisposition.NEW,completed.disposition); assertEquals(CalendarLifecycle.COMPLETED,completed.receipt.after.lifecycle)
        assertEquals(0,root.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE event_id=? AND operation='SYSTEM_ACTIVATE'",Int::class.java,completes.id.value))
        assertEquals(0,root.queryForObject("SELECT count(*) FROM notification_alerts WHERE source_type='SYSTEM_CAMPAIGN'",Int::class.java))
    }
    @Test fun `concurrent system advance applies once and exact loser replays while revision races are recorded`() {
        val repository=repo(); val admin=actor(); val scheduled=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(start=CalendarFixtures.now.plusSeconds(300),end=CalendarFixtures.now.plusSeconds(900))))
        val candidate=assertInstanceOf(CalendarSystemSelectionResult.Page::class.java,repository.select(CalendarFixtures.now.plusSeconds(300),CalendarSystemBatchSize.Default)).candidates.single()
        val barrier=CyclicBarrier(2); val pool=Executors.newFixedThreadPool(2)
        try {
            val results=(1..2).map { pool.submit<CalendarSystemAdvanceResult.Recorded> { barrier.await(); systemRecorded(repo().advance(candidate)) } }.map { it.get(20,TimeUnit.SECONDS) }
            assertEquals(setOf(CalendarSystemReceiptDisposition.NEW,CalendarSystemReceiptDisposition.REPLAY),results.map { it.disposition }.toSet())
            assertTrue(results.all { it.receipt.commandId==results.first().receipt.commandId && it.receipt.outcome==CalendarOutcome.APPLIED })
            assertEquals(1,root.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE command_id=?",Int::class.java,results.first().receipt.commandId.value))
        } finally { pool.shutdownNow() }

        val later=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Race",start=CalendarFixtures.now.plusSeconds(300),end=CalendarFixtures.now.plusSeconds(900))))
        val stale=assertInstanceOf(CalendarSystemSelectionResult.Page::class.java,repository.select(CalendarFixtures.now.plusSeconds(300),CalendarSystemBatchSize.Default)).candidates.single { it.eventId==later.id }
        recorded(repository.change(admin,request(later,CalendarStep.Cancel)))
        val conflict=systemRecorded(repository.advance(stale))
        assertEquals(CalendarSystemReceiptDisposition.NEW,conflict.disposition); assertEquals(CalendarOutcome.REVISION_CONFLICT,conflict.receipt.outcome)
    }
    @Test fun `revision exhausted identity is audited once then omitted so a later candidate progresses`() {
        val repository=repo(); val admin=actor()
        val first=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Exhausted",start=CalendarFixtures.now.plusSeconds(300),end=CalendarFixtures.now.plusSeconds(1200))))
        val second=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Progress",start=CalendarFixtures.now.plusSeconds(400),end=CalendarFixtures.now.plusSeconds(1200))))
        root.execute("ALTER TABLE calendar_events DISABLE TRIGGER trg_calendar_event")
        try {
            root.update("UPDATE calendar_events SET revision=?,snapshot=jsonb_set(snapshot,'{revision}',to_jsonb(CAST(? AS text))) WHERE id=?",Long.MAX_VALUE,Long.MAX_VALUE.toString(),first.id.value)
        } finally { root.execute("ALTER TABLE calendar_events ENABLE TRIGGER trg_calendar_event") }
        val observedAt=CalendarFixtures.now.plusSeconds(500); val sizeOne=requireNotNull(CalendarSystemBatchSize.from(1))
        val exhausted=assertInstanceOf(CalendarSystemSelectionResult.Page::class.java,repository.select(observedAt,sizeOne)).candidates.single()
        assertEquals(first.id,exhausted.eventId)
        val rejected=systemRecorded(repository.advance(exhausted)); assertEquals(CalendarOutcome.REVISION_EXHAUSTED,rejected.receipt.outcome)
        val next=assertInstanceOf(CalendarSystemSelectionResult.Page::class.java,repository.select(observedAt,sizeOne)).candidates.single()
        assertEquals(second.id,next.eventId); assertEquals(CalendarOutcome.APPLIED,systemRecorded(repository.advance(next)).receipt.outcome)
        assertEquals(1,root.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE event_id=? AND outcome='REVISION_EXHAUSTED'",Int::class.java,first.id.value))
    }
    @Test fun `cycle instant captured before a real database lock cannot cross into the activation window`() {
        val clock=MutableCalendarClock(); val repository=repo(clock); val admin=actor()
        val scheduled=schedule(repository,admin,create(repository,admin,CalendarFixtures.definition(title="Blocked boundary",start=CalendarFixtures.now.plusSeconds(300),end=CalendarFixtures.now.plusSeconds(900))))
        clock.instant=scheduled.definition.start.instant.minusSeconds(1)
        val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false; blocker.createStatement().use { it.execute("LOCK TABLE calendar_events IN ACCESS EXCLUSIVE MODE") }
            val future=pool.submit<CalendarSystemCycleResult> { CalendarSystemCycleService(clock,repository).run() }
            try {
                awaitDatabase { root.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%WITH validated AS MATERIALIZED%')",Boolean::class.java)!! }
                clock.instant=scheduled.definition.start.instant; blocker.commit()
                val early=assertInstanceOf(CalendarSystemCycleResult.Completed::class.java,future.get(15,TimeUnit.SECONDS))
                assertEquals(scheduled.definition.start.instant.minusSeconds(1),early.observedAt); assertEquals(0,early.selected)
                assertEquals(0,root.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE event_id=? AND actor_id IS NULL",Int::class.java,scheduled.id.value))
                val due=assertInstanceOf(CalendarSystemCycleResult.Completed::class.java,CalendarSystemCycleService(clock,repository).run())
                assertEquals(1,due.selected); assertEquals(1,due.applied)
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
    }
    @Test fun `corrupt selection and replay fail closed without effects`() {
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("CREATE TEMP TABLE calendar_events(id uuid,revision bigint,lifecycle text,snapshot jsonb)")
                statement.execute("CREATE TEMP TABLE calendar_command_receipts(event_id uuid,actor_id bigint,expected_revision bigint,outcome text,operation text)")
            }
            JdbcTemplate(SingleConnectionDataSource(connection,true)).update("INSERT INTO calendar_events VALUES(?,0,'SCHEDULED',?::jsonb)",UUID.randomUUID(),"{\"future\":true}")
            assertEquals(CalendarSystemSelectionResult.Corrupt,repo(connection).select(CalendarFixtures.now,CalendarSystemBatchSize.Default))
        }

        val draft=CalendarFixtures.draft(); val preflight=CalendarPreflight.check(CalendarFixtures.preflightId(),draft,CalendarFixtures.now)
        val scheduled=CalendarDecision.apply(draft,draft.revision,CalendarStep.Schedule,CalendarFixtures.now,preflight).event
        val candidate=requireNotNull(CalendarSystemCandidate.from(scheduled,scheduled.definition.start.instant))
        val command=CalendarFixtures.hasher.systemCommand(candidate.eventId,candidate.expectedRevision,candidate.operation,candidate.boundary)
        val reason="Authoritative calendar boundary"
        val hash=CalendarFixtures.hasher.hash(listOf("calendar-command-v1","SYSTEM",candidate.eventId.value.toString(),candidate.operation.wire,candidate.expectedRevision.value.toString(),reason,"",""))
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("CREATE TEMP TABLE calendar_command_bindings(command_id uuid,family text,actor_id bigint,event_id uuid,payload_hash text)")
                statement.execute("""CREATE TEMP TABLE calendar_command_receipts(command_id uuid,event_id uuid,actor_id bigint,operation text,expected_revision bigint,reason text,
                    requested_definition_hash text,preflight_id uuid,payload_hash text,outcome text,before_snapshot jsonb,after_snapshot jsonb,recorded_at timestamptz)""")
            }
            val jdbc=JdbcTemplate(SingleConnectionDataSource(connection,true))
            jdbc.update("INSERT INTO calendar_command_bindings VALUES(?,'EVENT',NULL,?,?)",command.value,candidate.eventId.value,hash.value)
            jdbc.update("INSERT INTO calendar_command_receipts VALUES(?,?,NULL,?,?,?,NULL,NULL,?,'APPLIED','{}'::jsonb,'{}'::jsonb,?)",command.value,candidate.eventId.value,candidate.operation.wire,candidate.expectedRevision.value,reason,hash.value,java.sql.Timestamp.from(candidate.observedAt))
            assertEquals(CalendarSystemAdvanceResult.Corrupt,repo(connection).advance(candidate))
            assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM calendar_command_receipts",Int::class.java))
        }
    }
    private fun shortSession(actor: InternalUserPrincipal): InternalUserPrincipal {
        val session=UUID.randomUUID()
        root.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES(?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '3 seconds',clock_timestamp()+interval '2 hours')""",
            session,actor.userId,UUID.randomUUID().toString().replace("-","").repeat(2))
        return actor.copy(sessionId=session)
    }
    private fun awaitExpiry(actor: InternalUserPrincipal)=awaitDatabase {
        root.queryForObject("SELECT idle_expires_at<clock_timestamp() FROM identity_sessions WHERE id=?",Boolean::class.java,actor.sessionId)!!
    }
    private fun awaitDatabase(condition: () -> Boolean) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        while(!condition()) { check(System.nanoTime()<deadline) { "Database condition timed out" }; Thread.sleep(20) }
    }
}
