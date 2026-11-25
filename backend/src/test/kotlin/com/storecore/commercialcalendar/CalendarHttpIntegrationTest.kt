package com.storecore.commercialcalendar

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
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
import java.net.URLEncoder
import java.sql.Connection
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties=["storecore.installation-guard.enabled=false","storecore.inventory.expiry-delay-ms=3600000"])
class CalendarHttpIntegrationTest @Autowired constructor(private val http: TestRestTemplate,private val jdbc: JdbcTemplate,private val mapper: ObjectMapper,
    private val passwords: Argon2PasswordHasher,@LocalServerPort private val port: Int) {
    companion object {
        private val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start(); registry.add("spring.datasource.url") { postgres.jdbcUrl }; registry.add("spring.datasource.username") { postgres.username }; registry.add("spring.datasource.password") { postgres.password }
        }
    }
    private val base="/api/v1/user/commercial-calendar"
    private data class Session(val cookie: String,val userId: Long,val sessionId: UUID,val role: InternalRole,var csrf: String) { fun principal()=InternalUserPrincipal(sessionId,userId,setOf(role)) }
    private fun provision(role: InternalRole=InternalRole.ADMIN): Session {
        val email="calendar-http-${UUID.randomUUID()}@example.test"
        val id=jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Calendar','HTTP') RETURNING id",Long::class.java,email,passwords.hash("calendar-fixture-password".toCharArray()))!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role.name)
        val response=exchange("/api/v1/internal/auth/login",HttpMethod.POST,mapper.writeValueAsString(mapOf("email" to email,"password" to "calendar-fixture-password")))
        assertEquals(200,response.statusCode.value(),response.body)
        return Session(response.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'),id,jdbc.queryForObject("SELECT id FROM identity_sessions WHERE user_id=? AND revoked_at IS NULL",UUID::class.java,id)!!,role,response.headers.getFirst("X-CSRF-Token")!!)
    }
    private fun exchange(path: String,method: HttpMethod=HttpMethod.GET,body: String?=null,session: Session?=null,key: String?=null,origin: String?="http://localhost:4200",csrf: String?=session?.csrf,media: MediaType=MediaType.APPLICATION_JSON): ResponseEntity<String> =
        http.exchange(URI("http://localhost:$port$path"),method,HttpEntity(body,HttpHeaders().apply {
            contentType=media; if(origin!=null) set(HttpHeaders.ORIGIN,origin); if(session!=null) set(HttpHeaders.COOKIE,session.cookie); if(csrf!=null) set("X-CSRF-Token",csrf); if(key!=null) set("Idempotency-Key",key)
        }),String::class.java)
    private fun data(response: ResponseEntity<String>): JsonNode=mapper.readTree(response.body!!).path("data")
    private fun post(path: String,session: Session,value: Any,key: String=UUID.randomUUID().toString()): ResponseEntity<String> = exchange(path,HttpMethod.POST,mapper.writeValueAsString(value),session,key).also { response -> response.headers.getFirst("X-CSRF-Token")?.let { session.csrf=it } }
    private fun time(instant: Instant): Map<String,String> {
        val zone=ZoneId.of("America/Argentina/Buenos_Aires")
        return mapOf("localDateTime" to LocalDateTime.ofInstant(instant,zone).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")),"timeZone" to zone.id,"offset" to zone.rules.getOffset(instant).id)
    }
    private fun definition(revision: String="0",start: Instant=Instant.now().truncatedTo(ChronoUnit.SECONDS).plusSeconds(3600),end: Instant=start.plusSeconds(7200),title: String="Calendar fixture ${UUID.randomUUID()}")=mapOf("definitionRevision" to revision,"title" to title,"description" to "Operational calendar","start" to time(start),"end" to time(end),"audience" to CalendarAudience.INTERNAL_ALL.wire,"campaignReference" to null,"reminders" to emptyList<Any>())
    private fun create(session: Session,definition: Map<String,Any?> = definition(),key: String=UUID.randomUUID().toString()): Pair<String,ResponseEntity<String>> {
        val response=post("$base/events",session,mapOf("definition" to definition),key)
        assertEquals(201,response.statusCode.value(),response.body)
        return data(response).path("eventId").asText() to response
    }
    private fun command(operation: CalendarOperation,revision: String,reason: String="Reviewed")=linkedMapOf<String,Any?>("operation" to operation.wire,"expectedRevision" to revision,"reason" to reason)
    private fun query(from: Instant,to: Instant,extra: String="")="$base/events?from=${URLEncoder.encode(from.toString(),Charsets.UTF_8)}&to=${URLEncoder.encode(to.toString(),Charsets.UTF_8)}$extra"
    private fun runtimeSource()=object: DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password) { override fun getConnection(): Connection=super.getConnection().also { it.createStatement().use { s -> s.execute("SET ROLE storecore_runtime") } } }
    private fun runtimeQueries(): JdbcCalendarQueries {
        val source=runtimeSource(); val jdbc=JdbcTemplate(source); val tx=TransactionTemplate(DataSourceTransactionManager(source)); val hasher=Sha256CalendarHasher()
        return JdbcCalendarQueries(jdbc,tx,mapper,hasher,JdbcCalendarPersistence(jdbc,tx,mapper,SystemCalendarClock(),RandomCalendarIds(),hasher))
    }
    @Test fun `create lost response recovery exact replay edit preflight approval and immutable historical audit are HTTP contracts`() {
        val admin=provision(); val key=UUID.randomUUID().toString(); val initialDefinition=definition(); val initialToken=admin.csrf
        val (event,created)=create(admin,initialDefinition,key)
        assertNotEquals(initialToken,admin.csrf); assertEquals("no-store",created.headers.cacheControl)
        assertEquals("0",data(created).path("after").path("revision").asText()); assertEquals("0",data(created).path("after").path("definition").path("definitionRevision").asText())
        val recovered=exchange("$base/commands/$key",session=admin); assertEquals(200,recovered.statusCode.value()); assertEquals(data(created),data(recovered))
        val replay=post("$base/events",admin,mapOf("definition" to initialDefinition),key); assertEquals(201,replay.statusCode.value()); assertEquals(data(created),data(replay))
        val editKey=UUID.randomUUID().toString(); val edit=command(CalendarOperation.EDIT,"0").apply { this["definition"]=definition("1",title="Revised calendar") }
        val edited=post("$base/events/$event/commands",admin,edit,editKey); assertEquals(200,edited.statusCode.value(),edited.body)
        val preflightKey=UUID.randomUUID().toString(); val preflight=post("$base/events/$event/preflights",admin,mapOf("expectedRevision" to "1"),preflightKey)
        assertEquals(200,preflight.statusCode.value(),preflight.body); assertEquals(0,data(preflight).path("preflight").path("issues").size())
        val preflightId=data(preflight).path("preflight").path("id").asText()
        val schedule=command(CalendarOperation.SCHEDULE,"1").apply { this["preflightId"]=preflightId }
        val scheduled=post("$base/events/$event/commands",admin,schedule); assertEquals(200,scheduled.statusCode.value(),scheduled.body)
        assertEquals(CalendarLifecycle.SCHEDULED.wire,data(scheduled).path("after").path("lifecycle").asText())
        val preflightReplay=post("$base/events/$event/preflights",admin,mapOf("expectedRevision" to "1"),preflightKey); assertEquals(data(preflight),data(preflightReplay))
        val oldEdit=post("$base/events/$event/commands",admin,edit,editKey); assertEquals(data(edited),data(oldEdit)); assertEquals("1",data(oldEdit).path("after").path("revision").asText())
        val oldCreate=exchange("$base/commands/$key",session=admin); assertEquals(CalendarLifecycle.DRAFT.wire,data(oldCreate).path("after").path("lifecycle").asText())
        val audit=exchange("$base/events/$event/audit?size=2",session=admin); assertEquals(200,audit.statusCode.value(),audit.body)
        assertEquals(3,data(audit).path("total").asInt()); assertEquals(2,data(audit).path("items").size()); assertTrue(data(audit).path("hasMore").asBoolean())
        assertTrue(data(audit).path("items").all { it.path("actorId").isTextual && it.path("actorId").asText()==admin.userId.toString() })
    }
    @Test fun `domain conflicts rotate CSRF and exact retry preserves rejected result and request revision`() {
        val admin=provision(); val (event,_)=create(admin)
        val wrong=command(CalendarOperation.EDIT,"0").apply { this["definition"]=definition("5") }; val key=UUID.randomUUID().toString(); val token=admin.csrf
        val rejected=post("$base/events/$event/commands",admin,wrong,key)
        assertEquals(409,rejected.statusCode.value(),rejected.body); assertEquals(CalendarOutcome.INVALID_DEFINITION.wire,data(rejected).path("outcome").asText()); assertNotEquals(token,admin.csrf)
        assertEquals(data(rejected),data(post("$base/events/$event/commands",admin,wrong,key)))
        val absent=command(CalendarOperation.SCHEDULE,"0").apply { this["preflightId"]=UUID.randomUUID().toString() }
        assertEquals(CalendarOutcome.PREFLIGHT_REQUIRED.wire,data(post("$base/events/$event/commands",admin,absent)).path("outcome").asText())
        val cancel=post("$base/events/$event/commands",admin,command(CalendarOperation.CANCEL,"0")); assertEquals(200,cancel.statusCode.value())
        val cas=post("$base/events/$event/commands",admin,command(CalendarOperation.CANCEL,"0")); assertEquals(409,cas.statusCode.value()); assertEquals(CalendarOutcome.REVISION_CONFLICT.wire,data(cas).path("outcome").asText())
    }
    @Test fun `roles realm ownership and live authority protect command receipts audit and switch without leaking private fields`() {
        val admin=provision(); val foreign=provision(); val operator=provision(InternalRole.OPERATOR); val key=UUID.randomUUID().toString(); val (event,_)=create(admin,key=key)
        for(path in listOf("$base/events/$event","$base/reminder-switch","$base/commands/$key","$base/events/$event/audit")) assertEquals(401,exchange(path).statusCode.value())
        val read=exchange("$base/events/$event",session=operator); assertEquals(200,read.statusCode.value(),read.body)
        for(field in listOf("actorId","reason","receipt","audit","availableOperations","sessionId","csrf")) assertFalse(read.body!!.contains("\"$field\""))
        val customer=exchange("/api/v1/customer/auth/register",HttpMethod.POST,mapper.writeValueAsString(mapOf("email" to "calendar-customer-${UUID.randomUUID()}@example.test","password" to "calendar-fixture-password","firstName" to "Calendar","lastName" to "Customer")))
        assertEquals(201,customer.statusCode.value(),customer.body)
        val customerHeaders=HttpHeaders().apply { set(HttpHeaders.COOKIE,customer.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')); set("X-Role","ADMIN"); set("X-Actor-Id",admin.userId.toString()) }
        val customerRead=http.exchange(URI("http://localhost:$port$base/events/$event"),HttpMethod.GET,HttpEntity<String>(customerHeaders),String::class.java)
        assertEquals(401,customerRead.statusCode.value()); assertEquals("no-store",customerRead.headers.cacheControl)
        val range=CalendarEventQuery.create(Instant.now().minusSeconds(86400),Instant.now().plusSeconds(86400))!!
        assertInstanceOf(CalendarQueryResult.Found::class.java,runtimeQueries().list(operator.principal(),range))
        assertInstanceOf(CalendarQueryResult.Found::class.java,runtimeQueries().detail(operator.principal(),CalendarEventId.fromWire(UUID.fromString(event))!!))
        for(path in listOf("$base/reminder-switch","$base/events/$event/audit","$base/commands/$key","$base/events/$event/commands/$key")) assertEquals(403,exchange(path,session=operator).statusCode.value())
        assertEquals(403,post("$base/events",operator,mapOf("definition" to definition())).statusCode.value())
        assertEquals(403,post("$base/events/$event/preflights",operator,mapOf("expectedRevision" to "0")).statusCode.value())
        val foreignRead=exchange("$base/commands/$key",session=foreign); val missing=exchange("$base/commands/${UUID.randomUUID()}",session=foreign)
        assertEquals(404,foreignRead.statusCode.value()); assertEquals(foreignRead.body,missing.body)
        assertEquals(404,exchange("$base/events/${UUID.randomUUID()}/commands/$key",session=admin).statusCode.value())
        assertEquals(404,exchange("$base/events/${UUID.randomUUID()}/audit",session=admin).statusCode.value())
        val seeded=CalendarFixtures.draft(); val codec=CalendarSnapshotCodec(mapper,Sha256CalendarHasher()); val source=DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password)
        TransactionTemplate(DataSourceTransactionManager(source)).executeWithoutResult {
            val fixtureJdbc=JdbcTemplate(source)
            fixtureJdbc.update("INSERT INTO calendar_events(id,revision,definition_revision,lifecycle,snapshot) VALUES(?,0,0,'DRAFT',?::jsonb)",seeded.id.value,codec.event(seeded))
            fixtureJdbc.update("INSERT INTO calendar_definitions(event_id,definition_revision,definition_hash,snapshot) VALUES(?,0,?,?::jsonb)",seeded.id.value,seeded.definition.hash.value,codec.definition(seeded.definition))
        }
        val emptyAudit=exchange("$base/events/${seeded.id.value}/audit",session=admin)
        assertEquals(200,emptyAudit.statusCode.value(),emptyAudit.body); assertEquals(0,data(emptyAudit).path("total").asInt()); assertEquals(0,data(emptyAudit).path("items").size())
        val state=exchange("$base/reminder-switch",session=admin); assertEquals(200,state.statusCode.value())
        assertEquals(setOf("configuredState","effectivity","revision","readiness","metadata"),data(state).fieldNames().asSequence().toSet())
        assertEquals(CalendarSwitchState.DISABLED.wire,data(state).path("configuredState").asText()); assertEquals(CalendarSwitchEffectivity.DISABLED.wire,data(state).path("effectivity").asText())
        assertEquals("0",data(state).path("revision").asText()); assertTrue(data(state).path("metadata").isNull); assertEquals(CalendarReminderReadiness.UNAVAILABLE.wire,data(state).path("readiness").asText())
        val switchKey=UUID.randomUUID().toString(); val switchBody=mapOf("operation" to "ENABLE","expectedRevision" to "0","owner" to "Commercial operations","reason" to "Reviewed temporary activation","expiresAt" to Instant.now().truncatedTo(ChronoUnit.SECONDS).plusSeconds(3600).toString(),"removalTicket" to "OPS-442","affectedAction" to "EMIT_IN_APP_CAMPAIGN_REMINDER")
        val token=admin.csrf; val denied=post("$base/reminder-switch/commands",admin,switchBody,switchKey)
        assertEquals(409,denied.statusCode.value(),denied.body); assertNotEquals(token,admin.csrf); assertEquals(CalendarOutcome.CAPABILITY_NOT_ACTIVE.wire,data(denied).path("outcome").asText())
        assertEquals(setOf("commandId","actorId","operation","outcome","expectedRevision","requestedMetadata","before","after","recordedAt"),data(denied).fieldNames().asSequence().toSet())
        val recoveredSwitch=exchange("$base/reminder-switch/commands/$switchKey",session=admin); assertEquals(200,recoveredSwitch.statusCode.value()); assertEquals(data(denied),data(recoveredSwitch))
        val foreignSwitch=exchange("$base/reminder-switch/commands/$switchKey",session=foreign); val missingSwitch=exchange("$base/reminder-switch/commands/${UUID.randomUUID()}",session=foreign)
        assertEquals(404,foreignSwitch.statusCode.value()); assertEquals(foreignSwitch.body,missingSwitch.body)
        val switchAudit=exchange("$base/reminder-switch/audit",session=admin); assertEquals(200,switchAudit.statusCode.value()); assertTrue(data(switchAudit).path("items").any { it.path("commandId").asText()==switchKey })
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",operator.userId)
        assertEquals(CalendarQueryResult.Unauthorized,runtimeQueries().detail(operator.principal(),CalendarEventId.fromWire(UUID.fromString(event))!!))
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",admin.userId)
        assertEquals(401,exchange("$base/commands/$key",session=admin).statusCode.value())
    }
    @Test fun `overlap boundaries stable ordering bounded pagination filters and nanos are real SQL reads`() {
        val admin=provision(); val from=Instant.parse("2080-01-10T00:00:00Z"); val to=from.plusSeconds(86400)
        create(admin,definition(start=from.minusSeconds(3600),end=from))
        val spanning=create(admin,definition(start=from.minusSeconds(1800),end=from.plusSeconds(1800))).first
        val tied=listOf(create(admin,definition(start=from.plusSeconds(3600))).first,create(admin,definition(start=from.plusSeconds(3600))).first).sorted()
        create(admin,definition(start=to))
        val first=exchange(query(from,to,"&size=2"),session=admin)
        assertEquals(200,first.statusCode.value(),first.body); assertEquals(3,data(first).path("total").asInt()); assertEquals(listOf(spanning,tied[0]),data(first).path("items").map { it.path("id").asText() }); assertTrue(data(first).path("hasMore").asBoolean())
        val last=exchange(query(from,to,"&size=2&page=1"),session=admin); assertEquals(listOf(tied[1]),data(last).path("items").map { it.path("id").asText() }); assertFalse(data(last).path("hasMore").asBoolean())
        val out=exchange(query(from,to,"&page=2147483647&size=100"),session=admin); assertEquals(3,data(out).path("total").asInt()); assertEquals(0,data(out).path("items").size()); assertFalse(data(out).path("hasMore").asBoolean())
        assertEquals(0,data(exchange(query(from,to,"&lifecycle=CANCELLED"),session=admin)).path("total").asInt())
        val nanos=exchange(query(from,from.plusSeconds(3600).plusNanos(1)),session=admin); assertEquals(3,data(nanos).path("total").asInt())
        for(extra in listOf("&size=101","&page=01","&audience=UNKNOWN","&lifecycle=FUTURE","&page=0&page=1","&actorId=1")) assertEquals(400,exchange(query(from,to,extra),session=admin).statusCode.value())
        assertEquals(400,exchange("$base/events",session=admin).statusCode.value())
        assertEquals(400,exchange("$base/events/$spanning/audit?size=101",session=admin).statusCode.value())
    }
    @Test fun `origin CSRF media exact JSON headers and public SYSTEM rejection produce no effects and no-store`() {
        val admin=provision(); val (event,_)=create(admin); val payload=mapper.writeValueAsString(command(CalendarOperation.CANCEL,"0")); val count=jdbc.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE event_id=?",Long::class.java,UUID.fromString(event))
        for(response in listOf(exchange("$base/events/$event/commands",HttpMethod.POST,payload,admin,UUID.randomUUID().toString(),origin=null),exchange("$base/events/$event/commands",HttpMethod.POST,payload,admin,UUID.randomUUID().toString(),origin="https://foreign.invalid"),exchange("$base/events/$event/commands",HttpMethod.POST,payload,admin,UUID.randomUUID().toString(),csrf="wrong"),exchange("$base/events/$event/commands",HttpMethod.POST,payload,admin,UUID.randomUUID().toString(),csrf=null))) {
            assertEquals(403,response.statusCode.value()); assertEquals("no-store",response.headers.cacheControl)
        }
        assertEquals(415,exchange("$base/events/$event/commands",HttpMethod.POST,payload,admin,UUID.randomUUID().toString(),media=MediaType.TEXT_PLAIN).statusCode.value())
        assertEquals(400,exchange("$base/events/$event/commands",HttpMethod.POST,payload,admin).statusCode.value())
        assertEquals(400,exchange("$base/events/$event/commands",HttpMethod.POST," ".repeat(CalendarHttpTranslator.MAX_BYTES+1),admin,UUID.randomUUID().toString()).statusCode.value())
        val duplicateHeaders=HttpHeaders().apply { contentType=MediaType.APPLICATION_JSON; set(HttpHeaders.ORIGIN,"http://localhost:4200"); set(HttpHeaders.COOKIE,admin.cookie); set("X-CSRF-Token",admin.csrf); add("Idempotency-Key",UUID.randomUUID().toString()); add("Idempotency-Key",UUID.randomUUID().toString()) }
        assertEquals(400,http.exchange(URI("http://localhost:$port$base/events/$event/commands"),HttpMethod.POST,HttpEntity(payload,duplicateHeaders),String::class.java).statusCode.value())
        val malformed=listOf(payload.dropLast(1)+",\"actorId\":\"1\"}",payload+" {}",payload.replace("\"CANCEL\"","\"SYSTEM_COMPLETE\""),payload.dropLast(1)+",\"reason\":\"duplicate\"}")
        for(raw in malformed) { val response=exchange("$base/events/$event/commands",HttpMethod.POST,raw,admin,UUID.randomUUID().toString()); assertEquals(400,response.statusCode.value(),response.body); assertEquals("no-store",response.headers.cacheControl) }
        assertEquals(count,jdbc.queryForObject("SELECT count(*) FROM calendar_command_receipts WHERE event_id=?",Long::class.java,UUID.fromString(event)))
        assertEquals(200,post("$base/events/$event/commands",admin,command(CalendarOperation.CANCEL,"0")).statusCode.value())
    }
    @Test fun `persisted future snapshot maps generic unavailable and rolls back command CSRF and bindings`() {
        val admin=provision(); val (event,_)=create(admin); val eventId=UUID.fromString(event)
        val original=jdbc.queryForObject("SELECT snapshot::text FROM calendar_events WHERE id=?",String::class.java,eventId)!!
        val checks=jdbc.queryForList("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='calendar_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%snapshot%'")
        checks.forEach { jdbc.execute("ALTER TABLE calendar_events DROP CONSTRAINT ${it["conname"]}") }
        jdbc.execute("ALTER TABLE calendar_events DISABLE TRIGGER trg_calendar_event")
        try {
            jdbc.update("UPDATE calendar_events SET snapshot=jsonb_set(snapshot,'{lifecycle}','\"FUTURE\"') WHERE id=?",eventId)
            val read=exchange("$base/events/$event",session=admin); assertEquals(503,read.statusCode.value(),read.body); assertFalse(read.body!!.contains("FUTURE")); assertEquals("no-store",read.headers.cacheControl)
            val key=UUID.randomUUID().toString(); val token=admin.csrf
            val failed=post("$base/events/$event/commands",admin,command(CalendarOperation.CANCEL,"0"),key); assertEquals(503,failed.statusCode.value(),failed.body); assertNull(failed.headers.getFirst("X-CSRF-Token")); assertEquals(token,admin.csrf)
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM calendar_command_bindings WHERE command_id=?",Int::class.java,UUID.fromString(key)))
        } finally {
            jdbc.update("UPDATE calendar_events SET snapshot=?::jsonb WHERE id=?",original,eventId)
            jdbc.execute("ALTER TABLE calendar_events ENABLE TRIGGER trg_calendar_event")
            checks.forEach { jdbc.execute("ALTER TABLE calendar_events ADD CONSTRAINT ${it["conname"]} ${it["definition"]}") }
        }
        assertEquals(200,post("$base/events/$event/commands",admin,command(CalendarOperation.CANCEL,"0")).statusCode.value())
    }
    @Test fun `runtime read authorization expires while waiting on membership lock and publishes nothing`() {
        val owner=provision(InternalRole.OPERATOR); val admin=provision(); val (event,_)=create(admin); val session=UUID.randomUUID()
        jdbc.update("""INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES(?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '3 seconds',clock_timestamp()+interval '2 hours')""",session,owner.userId,UUID.randomUUID().toString().replace("-","").repeat(2))
        val actor=owner.principal().copy(sessionId=session); val pool=Executors.newSingleThreadExecutor()
        DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password).connection.use { blocker ->
            blocker.autoCommit=false
            blocker.prepareStatement("SELECT user_id FROM user_roles WHERE user_id=? FOR UPDATE").use { it.setLong(1,owner.userId); it.execute() }
            val future=pool.submit<CalendarQueryResult<CalendarEvent>> { runtimeQueries().detail(actor,CalendarEventId.fromWire(UUID.fromString(event))!!) }
            try {
                awaitDatabase { jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT notification_read_authorized%')",Boolean::class.java)!! }
                awaitDatabase { jdbc.queryForObject("SELECT idle_expires_at<clock_timestamp() FROM identity_sessions WHERE id=?",Boolean::class.java,session)!! }
                blocker.commit(); assertEquals(CalendarQueryResult.Unauthorized,future.get(10,TimeUnit.SECONDS))
            } finally { blocker.rollback(); pool.shutdownNow() }
        }
    }
    private fun awaitDatabase(condition: () -> Boolean) { val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10); while(!condition()) { check(System.nanoTime()<deadline); Thread.sleep(20) } }
}
