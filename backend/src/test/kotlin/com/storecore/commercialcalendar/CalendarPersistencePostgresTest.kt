package com.storecore.commercialcalendar

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.*
import com.storecore.identity.domain.*
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
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
    private fun actor(role: InternalRole=InternalRole.ADMIN): InternalUserPrincipal {
        val id=root.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Calendar','Fixture') RETURNING id",Long::class.java,"calendar-${UUID.randomUUID()}@example.test","${'$'}argon2id${'$'}fixture")!!
        root.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role.name)
        val session=UUID.randomUUID()
        root.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES(?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",session,id,UUID.randomUUID().toString().replace("-","").repeat(2))
        return InternalUserPrincipal(session,id,setOf(role))
    }
    private fun recorded(result: CalendarPersistenceResult)=assertInstanceOf(CalendarPersistenceResult.Recorded::class.java,result).receipt
    private fun create(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,rules: List<CalendarReminderRule> = emptyList())=recorded(repo.create(actor,CalendarCreateRequest(CalendarFixtures.command(),CalendarFixtures.definition(rules=rules)))).after
    private fun request(event: CalendarEvent,step: CalendarStep,id: CalendarCommandId=CalendarFixtures.command(),revision: CalendarRevision=event.revision,definition: CalendarDefinition?=null,preflight: CalendarPreflightId?=null)=
        CalendarChangeRequest(id,event.id,revision,step,CalendarFixtures.reason,definition,preflight)
    private fun preflight(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,event: CalendarEvent)=assertInstanceOf(CalendarPreflightResult.Recorded::class.java,repo.preflight(actor,CalendarPreflightRequest(CalendarFixtures.command(),event.id,event.revision))).preflight!!
    private fun schedule(repo: JdbcCalendarPersistence,actor: InternalUserPrincipal,event: CalendarEvent)=recorded(repo.change(actor,request(event,CalendarStep.Schedule,preflight=preflight(repo,actor,event).id))).after

    @Test fun `clean and V35 upgrade preserve every published checksum and default disabled least privilege`() {
        root.execute("CREATE DATABASE calendar_upgrade")
        val url=postgres.jdbcUrl.substringBeforeLast('/')+"/calendar_upgrade"
        flyway(url,"35").migrate()
        val upgraded=JdbcTemplate(DriverManagerDataSource(url,postgres.username,postgres.password))
        val history=upgraded.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("36",flyway(url).migrate().targetSchemaVersion.toString())
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
        assertEquals(CalendarPersistenceResult.Unauthorized,repository.advance(event.id,event.revision,CalendarStep.Activate))
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
        fun bind(command: UUID,hash: String) { root.update("INSERT INTO calendar_command_bindings(command_id,family,actor_id,event_id,payload_hash) VALUES(?,'EVENT',?,?,?)",command,admin.userId,event.id.value,hash) }
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
        bind(forgedEditCommand,forgedEditPayload)
        assertThrows(DataAccessException::class.java) {
            root.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,requested_definition_hash,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
                VALUES(?,?,?,'EDIT',?,?,?,?,'APPLIED',?::jsonb,?::jsonb,?)""",forgedEditCommand,editEvent.id.value,admin.userId,editA.after.revision.value,
                CalendarFixtures.reason.value,definitionA.hash.value,forgedEditPayload,editBRow["before_snapshot"].toString(),editBRow["after_snapshot"].toString(),editBRow["recorded_at"])
        }
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
        val complete=recorded(repository.advance(scheduled.id,scheduled.revision,CalendarStep.Complete))
        assertNull(complete.actorId); assertEquals(CalendarLifecycle.COMPLETED,complete.after.lifecycle)
        clock.instant=clock.instant.plusSeconds(86400)
        val retry=recorded(repository.advance(scheduled.id,scheduled.revision,CalendarStep.Complete))
        assertEquals(complete.commandId,retry.commandId); assertEquals(complete.recordedAt,retry.recordedAt)
        assertEquals(CalendarPersistenceResult.Missing,repository.receipt(admin,complete.commandId))
        for(table in listOf("calendar_definitions","calendar_reminder_rules","calendar_preflights","calendar_command_bindings","calendar_preflight_requests","calendar_command_receipts","calendar_audit")) {
            assertThrows(DataAccessException::class.java) { root.update("DELETE FROM $table") }
        }
        assertThrows(DataAccessException::class.java) { root.update("DELETE FROM calendar_events WHERE id=?",scheduled.id.value) }
        assertThrows(DataAccessException::class.java) { root.update("UPDATE calendar_events SET snapshot=jsonb_set(snapshot,'{definition,title}','\"tampered\"') WHERE id=?",scheduled.id.value) }
        assertEquals(CalendarOutcome.INVALID_TRANSITION,recorded(repository.advance(scheduled.id,complete.after.revision,CalendarStep.Activate)).outcome)
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
