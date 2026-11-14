package com.storecore.commerce

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.*
import com.storecore.commerce.infrastructure.JdbcStockAdjustmentService
import com.storecore.commerce.infrastructure.JdbcInventoryService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false", "storecore.inventory.expiry-delay-ms=3600000"])
class StockAdjustmentHttpIntegrationTest @Autowired constructor(
    private val http: TestRestTemplate, private val jdbc: JdbcTemplate, private val mapper: ObjectMapper,
    private val passwords: Argon2PasswordHasher, private val service: JdbcStockAdjustmentService,
    private val inventory: JdbcInventoryService, private val transactions: TransactionTemplate,
    @LocalServerPort private val port: Int,
) {
    @Test fun `lost response recovers immutable original receipt after reservation with one effect`() {
        val session = provision(); activate(session)
        val variant = variant(8)
        val key = UUID.randomUUID(); val body = body(key)
        val response = post(variant, body, session)
        assertEquals(200,response.statusCode.value(),response.body)
        assertEquals("no-store",response.headers.cacheControl)
        val original = data(response)
        assertEquals("APPLIED",original.path("state").asText())
        assertEquals(6,original.path("after").path("available").asInt())
        inventory.reserve(UUID.randomUUID(),UUID.randomUUID(),variant,1,"TEST")
        // Recovery obtains fresh CSRF rather than depending on the lost POST headers.
        val recovered = exchange("/api/v1/internal/auth/csrf",HttpMethod.GET,session=session)
        session.csrf = recovered.headers.getFirst("X-CSRF-Token")!!
        val replay = post(variant,body,session)
        assertEquals(200,replay.statusCode.value(),replay.body)
        assertEquals(original,data(replay))
        assertEquals(5,available(variant))
        assertEffects(variant,1)
        val lookup = get(variant,key,session)
        assertEquals("FOUND",data(lookup).path("lookup").asText())
        assertEquals(original,data(lookup).path("receipt"))
    }

    @Test fun `business rejection and missing balance are durable and cannot later apply`() {
        val session=provision();activate(session)
        val variant=variant(8);val key=UUID.randomUUID()
        val rejected=post(variant,body(key,expected=7),session)
        assertEquals(409,rejected.statusCode.value(),rejected.body)
        assertEquals("BALANCE_CHANGED",data(rejected).path("reason").asText())
        assertNotNull(rejected.headers.getFirst("X-CSRF-Token"))
        jdbc.update("UPDATE inventory_balances SET available_quantity=7 WHERE variant_id=?",variant)
        val replay=post(variant,body(key,expected=7),session)
        assertEquals(data(rejected),data(replay));assertEquals(7,available(variant));assertEffects(variant,0)
        val missing=variant(null);val missingKey=UUID.randomUUID()
        val absent=post(missing,body(missingKey),session)
        assertEquals(409,absent.statusCode.value(),absent.body)
        assertEquals("BALANCE_MISSING",data(absent).path("reason").asText())
        assertEquals(0,count("SELECT count(*) FROM inventory_balances WHERE variant_id=?",missing))
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity) VALUES (?,8)",missing)
        assertEquals(data(absent),data(post(missing,body(missingKey),session)))
        assertEffects(missing,0)
    }

    @Test fun `UUID ownership and payload are immutable without disclosing another receipt`() {
        val session=provision();activate(session);val other=provision()
        val variant=variant(8);val key=UUID.randomUUID()
        assertEquals(200,post(variant,body(key),session).statusCode.value())
        listOf(post(variant,body(key,delta=-1),session),post(variant,body(key),other),post(variant(8),body(key),session)).forEach {
            assertEquals(409,it.statusCode.value(),it.body)
            assertEquals("IDEMPOTENCY_CONFLICT",mapper.readTree(it.body).path("errorCode").asText())
            assertTrue(mapper.readTree(it.body).path("data").isNull)
        }
        assertEquals("NOT_FOUND",data(get(variant,key,other)).path("lookup").asText())
        assertEquals("NOT_FOUND",data(get(variant,UUID.randomUUID(),other)).path("lookup").asText())
        assertEffects(variant,1)
    }

    @Test fun `same UUID races replay once and competing deltas cannot both apply`() {
        val session=provision();activate(session)
        val variant=variant(8);val key=UUID.randomUUID()
        val same = concurrent { service.adjust(session.principal(),command(variant,key)) }
        assertEquals((same[0] as StockAdjustmentExecution.Recorded).receipt,(same[1] as StockAdjustmentExecution.Recorded).receipt)
        assertEffects(variant,1);assertEquals(6,available(variant))
        val second=variant(8)
        val different=concurrent { service.adjust(session.principal(),command(second,UUID.randomUUID())) }.map { (it as StockAdjustmentExecution.Recorded).receipt }
        assertEquals(1,different.count { it.state==StockAdjustmentState.APPLIED })
        assertEquals(1,different.count { it.reason==StockAdjustmentRejection.BALANCE_CHANGED })
        assertEffects(second,1);assertEquals(6,available(second))
    }

    @Test fun `reservation consumption and release invalidate every reviewed snapshot`() {
        val session=provision();activate(session)
        val variant=variant(8);val saga=UUID.randomUUID()
        inventory.reserve(saga,UUID.randomUUID(),variant,2,"TEST")
        assertEquals(StockAdjustmentRejection.BALANCE_CHANGED,recorded(service.adjust(session.principal(),command(variant,UUID.randomUUID()))).reason)
        val reserved=StockBalanceSnapshot(6,2,0)
        inventory.consumeSaga(saga,"TEST")
        val consumeCommand=AdjustAvailableStockCommand.create(UUID.randomUUID(),variant,1,reserved,"Count")
        assertEquals(StockAdjustmentRejection.BALANCE_CHANGED,recorded(service.adjust(session.principal(),consumeCommand)).reason)
        val releasing=variant(8);val id=inventory.reserve(UUID.randomUUID(),UUID.randomUUID(),releasing,2,"TEST")
        jdbc.update("UPDATE inventory_reservations SET created_at=now()-interval '31 minutes',expires_at=now()-interval '1 second' WHERE id=?",id)
        inventory.expireOverdue()
        assertEquals(StockAdjustmentRejection.BALANCE_CHANGED,recorded(service.adjust(session.principal(),AdjustAvailableStockCommand.create(UUID.randomUUID(),releasing,1,reserved,"Count"))).reason)
        assertEffects(variant,0);assertEffects(releasing,0)
    }

    @Test fun `rollback after ledger and audit leaves no effect or receipt`() {
        val session=provision();activate(session);val variant=variant(8);val key=UUID.randomUUID()
        assertThrows(IllegalStateException::class.java) {
            transactions.executeWithoutResult {
                assertEquals(StockAdjustmentState.APPLIED,recorded(service.adjust(session.principal(),command(variant,key))).state)
                throw IllegalStateException("injected failure before outer commit")
            }
        }
        assertEquals(8,available(variant));assertEffects(variant,0)
        assertEquals("NOT_FOUND",data(get(variant,key,session)).path("lookup").asText())
        assertEquals(200,post(variant,body(key),session).statusCode.value());assertEffects(variant,1)
    }

    private enum class BalanceWriter { RESERVATION, CONSUMPTION, EXPIRY }

    @Test fun `queued adjustment rechecks balance after reservation consumption and expiry commit`() {
        val session=provision();activate(session)
        for(writer in BalanceWriter.entries) {
            val variant=variant(8);val saga=UUID.randomUUID()
            val reservation=if(writer!=BalanceWriter.RESERVATION)inventory.reserve(saga,UUID.randomUUID(),variant,2,"TEST") else null
            if(writer==BalanceWriter.EXPIRY)jdbc.update("UPDATE inventory_reservations SET created_at=now()-interval '31 minutes',expires_at=now()-interval '1 second' WHERE id=?",reservation)
            val expected=if(reservation==null)StockBalanceSnapshot(8,0,0) else StockBalanceSnapshot(6,2,0)
            val command=AdjustAvailableStockCommand.create(UUID.randomUUID(),variant,1,expected,"Count")
            val pool=Executors.newSingleThreadExecutor()
            try {
                lateinit var pending:java.util.concurrent.Future<StockAdjustmentExecution>
                transactions.executeWithoutResult {
                    jdbc.query("SELECT variant_id FROM inventory_balances WHERE variant_id=? FOR UPDATE",{rs,_->rs.getLong(1)},variant)
                    val blocker=jdbc.queryForObject("SELECT pg_backend_pid()",Int::class.java)!!
                    pending=pool.submit<StockAdjustmentExecution> { service.adjust(session.principal(),command) }
                    awaitBalanceWaiter(blocker)
                    when(writer) {
                        BalanceWriter.RESERVATION -> inventory.reserve(saga,UUID.randomUUID(),variant,2,"TEST")
                        BalanceWriter.CONSUMPTION -> inventory.consumeSaga(saga,"TEST")
                        BalanceWriter.EXPIRY -> inventory.expireOverdue()
                    }
                }
                assertEquals(StockAdjustmentRejection.BALANCE_CHANGED,recorded(pending.get(15,TimeUnit.SECONDS)).reason)
                assertEffects(variant,0)
            } finally { pool.shutdownNow() }
        }
    }

    @Test fun `reservation queued behind applied adjustment preserves both effects`() {
        val session=provision();activate(session);val variant=variant(8)
        val pool=Executors.newSingleThreadExecutor()
        try {
            lateinit var pending:java.util.concurrent.Future<Long>
            transactions.executeWithoutResult {
                assertEquals(StockAdjustmentState.APPLIED,recorded(service.adjust(session.principal(),command(variant,UUID.randomUUID()))).state)
                val blocker=jdbc.queryForObject("SELECT pg_backend_pid()",Int::class.java)!!
                pending=pool.submit<Long> { inventory.reserve(UUID.randomUUID(),UUID.randomUUID(),variant,2,"TEST") }
                awaitBalanceWaiter(blocker)
            }
            assertTrue(pending.get(15,TimeUnit.SECONDS)>0)
            assertEquals(4,available(variant));assertEquals(2,count("SELECT reserved_quantity FROM inventory_balances WHERE variant_id=?",variant));assertEffects(variant,1)
        } finally { pool.shutdownNow() }
    }

    private fun awaitBalanceWaiter(blocker:Int) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        // Observe on a separate autocommit connection: pg_stat_activity snapshots
        // inside the blocked writer's transaction otherwise remain cached.
        jdbc.dataSource!!.connection.use { observer ->
            observer.prepareStatement("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock' AND query LIKE '%inventory_balances%FOR UPDATE%')").use { statement ->
                statement.setInt(1,blocker)
                while(System.nanoTime()<deadline) {
                    statement.executeQuery().use { result -> if(result.next() && result.getBoolean(1))return }
                    Thread.sleep(20)
                }
            }
        }
        throw AssertionError("stock writer did not wait for balance lock")
    }

    @Test fun `HTTP rejects coercion negative overflow reason csrf origin and missing identity`() {
        val session=provision();activate(session);val variant=variant(8)
        listOf("1.2","1e1","\"2\"","2147483648","0").forEach { delta ->
            val invalid=body(UUID.randomUUID()).replace("\"quantityDelta\":-2","\"quantityDelta\":$delta")
            val response=post(variant,invalid,session)
            assertEquals(400,response.statusCode.value(),response.body)
            assertEquals("INVALID_COMMAND",mapper.readTree(response.body).path("errorCode").asText())
        }
        assertEquals(422,post(variant,body(UUID.randomUUID(),delta=-9),session).statusCode.value())
        val max=variant(Int.MAX_VALUE)
        assertEquals(422,post(max,body(UUID.randomUUID(),delta=1,expected=Int.MAX_VALUE),session).statusCode.value())
        val path="/api/v1/user/inventory/$variant/adjustments"
        assertEquals(403,exchange(path,HttpMethod.POST,body(UUID.randomUUID()),session,origin="https://foreign.invalid").statusCode.value())
        assertEquals(403,exchange(path,HttpMethod.POST,body(UUID.randomUUID()),session,csrf="invalid").statusCode.value())
        assertEquals(401,exchange(path,HttpMethod.POST,body(UUID.randomUUID()),csrf="present-without-identity").statusCode.value())
        assertEquals(8,available(variant));assertEffects(variant,0)
    }

    @Test fun `receipt and new writes honor live authority and read-only capability`() {
        val session=provision();activate(session);val variant=variant(8);val key=UUID.randomUUID()
        assertEquals(200,post(variant,body(key),session).statusCode.value())
        capability(session,"READ_ONLY")
        assertEquals("FOUND",data(get(variant,key,session)).path("lookup").asText())
        assertEquals(409,post(variant,body(UUID.randomUUID(),expected=6),session).statusCode.value())
        activate(session)
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",session.userId)
        assertThrows(com.storecore.identity.application.AuthorizationDenied::class.java) { service.adjust(session.principal(),command(variant,UUID.randomUUID())) }
        assertTrue(get(variant,key,session).statusCode.value() in setOf(401,403))
        assertEffects(variant,1)
    }

    private fun <T> concurrent(action: () -> T): List<T> {
        val executor=Executors.newFixedThreadPool(2);val start=CountDownLatch(1)
        try {
            val jobs=(1..2).map { executor.submit(Callable { start.await();action() }) }
            start.countDown();return jobs.map { it.get(20,TimeUnit.SECONDS) }
        } finally { executor.shutdownNow() }
    }
    private fun recorded(result:StockAdjustmentExecution)=(result as StockAdjustmentExecution.Recorded).receipt
    private fun command(variant:Long,key:UUID)=AdjustAvailableStockCommand.create(key,variant,-2,StockBalanceSnapshot(8,0,0),"Count")
    private fun body(key:UUID,delta:Int=-2,expected:Int=8)="""{"commandId":"$key","quantityDelta":$delta,"expected":{"available":$expected,"reserved":0,"safety":0},"reason":"Count"}"""
    private fun post(variant:Long,body:String,session:Session)=exchange("/api/v1/user/inventory/$variant/adjustments",HttpMethod.POST,body,session).also { it.headers.getFirst("X-CSRF-Token")?.let { token -> session.csrf=token } }
    private fun get(variant:Long,key:UUID,session:Session)=exchange("/api/v1/user/inventory/$variant/adjustments/$key",HttpMethod.GET,session=session)
    private fun available(variant:Long)=jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?",Int::class.java,variant)!!
    private fun count(sql:String,arg:Any)=jdbc.queryForObject(sql,Int::class.java,arg)!!
    private fun assertEffects(variant:Long,expected:Int) {
        assertEquals(expected,count("SELECT count(*) FROM inventory_ledger WHERE variant_id=? AND event_type='ADJUSTMENT'",variant))
        assertEquals(expected,count("SELECT count(*) FROM audit_events WHERE aggregate_type='INVENTORY_VARIANT' AND aggregate_id=? AND event_type='INVENTORY_ADJUSTED'",variant))
    }
    private fun data(response:ResponseEntity<String>):JsonNode=mapper.readTree(response.body!!).path("data")
    private fun exchange(path:String,method:HttpMethod,body:String?=null,session:Session?=null,origin:String="http://localhost:4200",csrf:String?=session?.csrf)=http.exchange(URI("http://localhost:$port$path"),method,HttpEntity(body,HttpHeaders().apply {
        contentType=MediaType.APPLICATION_JSON;set(HttpHeaders.ORIGIN,origin);session?.let { set(HttpHeaders.COOKIE,it.cookie) };csrf?.let { set("X-CSRF-Token",it) }
    }),String::class.java)
    private data class Session(val cookie:String,val userId:Long,val sessionId:UUID,var csrf:String) {
        fun principal()=InternalUserPrincipal(sessionId,userId,setOf(InternalRole.ADMIN))
    }
    private fun provision():Session {
        val email="stock-${UUID.randomUUID()}@example.invalid"
        val id=jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Stock','User') RETURNING id",Long::class.java,email,passwords.hash("a-very-long-password".toCharArray()))!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'",id)
        val login=exchange("/api/v1/internal/auth/login",HttpMethod.POST,"""{"email":"$email","password":"a-very-long-password"}""")
        assertEquals(200,login.statusCode.value(),login.body)
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'),id,jdbc.queryForObject("SELECT id FROM identity_sessions WHERE user_id=? AND revoked_at IS NULL",UUID::class.java,id)!!,login.headers.getFirst("X-CSRF-Token")!!)
    }
    private fun activate(session:Session)=capability(session,"ACTIVE")
    private fun capability(session:Session,state:String) {
        if(jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'",String::class.java)==state)return
        val version=jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'",Int::class.java)!!
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)",{_,_->},session.userId,session.sessionId,"MANUAL_FULFILLMENT",version,state,jdbc.queryForObject("SELECT config::text FROM module_configurations WHERE module_code=?",String::class.java,"MANUAL_FULFILLMENT"),UUID.randomUUID(),"test")
    }
    private fun variant(available:Int?):Long {
        val product=jdbc.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('Stock',?,100) RETURNING id",Long::class.java,"stock-${UUID.randomUUID()}")!!
        val id=jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Stock') RETURNING id",Long::class.java,product,"stock-${UUID.randomUUID()}")!!
        if(available!=null)jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity) VALUES (?,?)",id,available)
        return id
    }
    companion object {
        private val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry:DynamicPropertyRegistry) {
            postgres.start();registry.add("spring.datasource.url"){postgres.jdbcUrl};registry.add("spring.datasource.username"){postgres.username};registry.add("spring.datasource.password"){postgres.password}
        }
    }
}
