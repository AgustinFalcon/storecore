package com.storecore.commercialcalendar

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.*
import com.storecore.identity.domain.*
import com.storecore.configuration.application.*
import com.storecore.configuration.domain.CapabilityActor
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
import java.time.Instant
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
    private fun runtime()=object: DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password) {
        override fun getConnection(): Connection=super.getConnection().also { it.createStatement().use { s -> s.execute("SET ROLE storecore_runtime") } }
    }
    private fun repo(clock: CalendarClock=MutableCalendarClock(),ids: CalendarIds=RandomCalendarIds()): JdbcCalendarPersistence {
        val source=runtime()
        return JdbcCalendarPersistence(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),jacksonObjectMapper(),clock,ids,CalendarFixtures.hasher)
    }
    private fun repo(connection: Connection,clock: CalendarClock=MutableCalendarClock()): JdbcCalendarPersistence {
        val source=SingleConnectionDataSource(connection,true)
        return JdbcCalendarPersistence(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),jacksonObjectMapper(),clock,RandomCalendarIds(),CalendarFixtures.hasher)
    }
    private fun switchRepo(clock: CalendarClock=MutableCalendarClock(),active: Boolean=true): JdbcCalendarSwitchPersistence {
        val source=runtime()
        val capability=object: CapabilityDecisionPort { override fun decide(module: String,action: String,actor: CapabilityActor) { if(!active) throw CapabilityDisabled() } }
        return JdbcCalendarSwitchPersistence(JdbcTemplate(source),TransactionTemplate(DataSourceTransactionManager(source)),jacksonObjectMapper(),clock,CalendarFixtures.hasher,capability)
    }
    private fun switchRequest(id: CalendarCommandId=CalendarFixtures.command(),revision: CalendarRevision=CalendarRevision.Zero,operation: CalendarSwitchOperation=CalendarSwitchOperation.ENABLE,expires: Instant=CalendarFixtures.now.plusSeconds(3600))=
        CalendarSwitchCommandRequest(id,revision,operation,requireNotNull(CalendarSwitchOwner.fromWire("Operations owner")),CalendarFixtures.reason,expires,requireNotNull(CalendarRemovalTicket.fromWire("OPS-442")),CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER)
    private fun switchRecorded(value: CalendarSwitchPersistenceResult)=assertInstanceOf(CalendarSwitchPersistenceResult.Recorded::class.java,value).receipt
    private fun actor(role: InternalRole=InternalRole.ADMIN): InternalUserPrincipal {
        val id=root.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Calendar','Fixture') RETURNING id",Long::class.java,"calendar-${UUID.randomUUID()}@example.test","${'$'}argon2id${'$'}fixture")!!
        root.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role.name)
        val session=UUID.randomUUID()
        root.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES(?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",session,id,UUID.randomUUID().toString().replace("-","").repeat(2))
        return InternalUserPrincipal(session,id,setOf(role))
    }
    private fun recorded(result: CalendarPersistenceResult)=assertInstanceOf(CalendarPersistenceResult.Recorded::class.java,result).receipt
    private fun systemRecorded(result: CalendarSystemAdvanceResult)=assertInstanceOf(CalendarSystemAdvanceResult.Recorded::class.java,result)
    private fun create(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,rules: List<CalendarReminderRule> = emptyList())=recorded(repo.create(actor,CalendarCreateRequest(CalendarFixtures.command(),CalendarFixtures.definition(rules=rules)))).after
    private fun create(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,definition: CalendarDefinition)=recorded(repo.create(actor,CalendarCreateRequest(CalendarFixtures.command(),definition))).after
    private fun request(event: CalendarEvent,step: CalendarStep,id: CalendarCommandId=CalendarFixtures.command(),revision: CalendarRevision=event.revision,definition: CalendarDefinition?=null,preflight: CalendarPreflightId?=null)=
        CalendarChangeRequest(id,event.id,revision,step,CalendarFixtures.reason,definition,preflight)
    private fun preflight(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,event: CalendarEvent)=assertInstanceOf(CalendarPreflightResult.Recorded::class.java,repo.preflight(actor,CalendarPreflightRequest(CalendarFixtures.command(),event.id,event.revision))).preflight!!
    private fun schedule(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,event: CalendarEvent)=recorded(repo.change(actor,request(event,CalendarStep.Schedule,preflight=preflight(repo,actor,event).id))).after

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

    @Test fun `clean and V35 upgrade preserve every published checksum and default disabled least privilege`() {
        root.execute("CREATE DATABASE calendar_upgrade")
        val url=postgres.jdbcUrl.substringBeforeLast('/')+"/calendar_upgrade"
        flyway(url,"35").migrate()
        val upgraded=JdbcTemplate(DriverManagerDataSource(url,postgres.username,postgres.password))
        val history=upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("37",flyway(url).migrate().targetSchemaVersion.toString())
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
        root.update("UPDATE identity_sessions SET revoked_at=clock_timestamp(),revocation_kind='SELF',revoked_by_user_id=?,revocation_correlation_id=?,revoked_reason='Fixture' WHERE id=?",admin.userId,UUID.randomUUID(),admin.sessionId)
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
