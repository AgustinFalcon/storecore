package com.storecore.catalog

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.domain.*
import com.storecore.catalog.infrastructure.JdbcCatalogService
import com.storecore.catalog.infrastructure.JdbcCatalogProjectionReader
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
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI
import java.time.Instant
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class CatalogProjectionHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val mapper: ObjectMapper,
    @Autowired private val passwords: Argon2PasswordHasher,
    @Autowired private val catalog: JdbcCatalogService,
    @Autowired private val reader: JdbcCatalogProjectionReader,
    @LocalServerPort private val port: Int,
) {
    @Test fun `missing and zero remain distinct with exact inventory formulas and closed precedence`() {
        val session=provision(); activate("STOREFRONT",session); activate("MANUAL_FULFILLMENT",session)
        val p=product(); val missing=variant(p,"Missing"); val zero=variant(p,"Zero"); val stocked=variant(p,"Stocked")
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock) VALUES (?,0,0,0),(?,8,3,2)",zero.first,stocked.first)
        val data=data(get("/api/v1/catalog/products/${missing.second}"))
        val variants=data.path("variants").associateBy { it.path("sku").asText() }
        assertEquals("UNAVAILABLE",variants[missing.second]!!.path("availability").asText())
        val absent=variants[missing.second]!!.path("inventory")
        assertEquals("MISSING",absent.path("state").asText())
        listOf("available","reserved","onHand","safety","saleable","updatedAt").forEach { assertTrue(absent.path(it).isNull,it) }
        assertEquals("OUT_OF_STOCK",variants[zero.second]!!.path("availability").asText())
        assertEquals(0,variants[zero.second]!!.path("inventory").path("saleable").asInt())
        val known=variants[stocked.second]!!.path("inventory")
        assertEquals(11,known.path("onHand").asInt()); assertEquals(6,known.path("saleable").asInt()); assertEquals(8,known.path("available").asInt())
        assertEquals(setOf("variantId","sku","productName","variantLabel","available","reserved","onHand","safety","saleable","updatedAt","state"),known.fieldNames().asSequence().toSet())
        assertEquals("AVAILABLE",variants[stocked.second]!!.path("availability").asText())
        val inventory=data(get("/api/v1/user/inventory?size=50",session.cookie)).path("items")
        assertEquals("MISSING",inventory.single { it.path("variantId").asText()==missing.first.toString() }.path("state").asText())
        assertEquals(400,get("/api/v1/user/inventory?size=51",session.cookie).statusCode.value())
        jdbc.update("UPDATE inventory_balances SET safety_stock=10 WHERE variant_id=?",stocked.first)
        assertEquals(VariantAvailability.OUT_OF_STOCK,catalog.product(stocked.second)!!.variants.single { it.sku==stocked.second }.availability)
    }
    @Test fun `identity ordered media attributes public visibility admin deduplication and stable pages`() {
        val session=provision();activate("STOREFRONT",session);activate("CATALOG",session)
        val name="PARITY-${UUID.randomUUID()}"; val p=product(name);val p2=product(name);val draft=product(name,"DRAFT");val archived=product(name,"ARCHIVED")
        val first=variant(p,"First");variant(p,"Second");val hidden=variant(p,"Hidden",false);variant(p2,"Other");variant(draft,"Draft");variant(archived,"Archived")
        jdbc.update("UPDATE product_variants SET attributes=?::jsonb WHERE id=?","""{"size":"M","color":"blue"}""",first.first)
        jdbc.update("INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://example.invalid/z.png',2,false),(?,'https://example.invalid/a.png',0,true)",p,p)
        val detail=data(get("/api/v1/catalog/products/${first.second}"))
        assertEquals(p.toString(),detail.path("id").asText());assertEquals(first.second,detail.path("sku").asText())
        assertEquals(listOf("https://example.invalid/a.png","https://example.invalid/z.png"),detail.path("images").map { it.asText() })
        assertEquals("blue",detail.path("variants").first().path("attributes").path("color").asText())
        assertEquals(2,detail.path("variants").size());assertEquals(404,get("/api/v1/catalog/products/${hidden.second}").statusCode.value())
        val admin=data(get("/api/v1/user/catalog/products/${hidden.second}",session.cookie));assertEquals(3,admin.path("variants").size());assertEquals("INACTIVE",admin.path("variants").last().path("status").asText())
        val page0=data(get("/api/v1/catalog?query=$name&size=1&page=0"));val page1=data(get("/api/v1/catalog?query=$name&size=1&page=1"))
        assertEquals(2,page0.path("total").asInt());assertTrue(page0.path("truncated").asBoolean());assertFalse(page1.path("truncated").asBoolean())
        assertEquals(p.toString(),page0.path("items").first().path("id").asText());assertEquals(p2.toString(),page1.path("items").first().path("id").asText())
        val beyond=data(get("/api/v1/catalog?query=$name&size=1&page=2"))
        assertEquals(2,beyond.path("total").asInt());assertEquals(0,beyond.path("items").size());assertFalse(beyond.path("truncated").asBoolean())
        val complete=data(get("/api/v1/catalog?query=$name&size=50"))
        assertEquals(2,complete.path("items").size());assertFalse(complete.path("truncated").asBoolean())
        assertEquals(400,get("/api/v1/user/catalog?size=51",session.cookie).statusCode.value())
        val all=reader.list(true,query=name).items;assertEquals(4,all.size);assertEquals(4,all.map{it.id}.distinct().size);assertTrue(all.any{it.status==ProductStatus.ARCHIVED});assertTrue(all.any{it.status==ProductStatus.DRAFT})
        assertEquals(400,get("/api/v1/catalog?size=51").statusCode.value());assertEquals(400,get("/api/v1/catalog?page=-1").statusCode.value())
    }
    @Test fun `HTTP writer preserves archived and inactive closed statuses and rejects unknown atomically`() {
        val session=provision();activate("CATALOG",session)
        val p=product();val v=variant(p,"Original")
        fun body(productStatus:String,variantStatus:String,name:String="Stored")="""{"name":"$name","status":"$productStatus","price":{"base":100},"variants":[{"sku":"${v.second}","name":"Stored variant","status":"$variantStatus","attributes":{"zz":"last","a":"first"}}]}"""
        val response=exchange("/api/v1/user/catalog/products/${v.second}",HttpMethod.PUT,body("ARCHIVED","INACTIVE"),session.cookie,session.csrf)
        val saved=data(response);assertEquals("ARCHIVED",saved.path("status").asText());assertEquals("INACTIVE",saved.path("variants").first().path("status").asText())
        assertEquals("Stored variant",saved.path("variants").first().path("name").asText());assertEquals(listOf("zz","a"),saved.path("variants").first().path("attributes").fieldNames().asSequence().toList())
        assertEquals(p.toString(),saved.path("id").asText());assertEquals(v.first.toString(),saved.path("variants").first().path("id").asText())
        val csrf=response.headers.getFirst("X-CSRF-Token")!!
        assertEquals(400,exchange("/api/v1/user/catalog/products/${v.second}",HttpMethod.PUT,body("FUTURE","ACTIVE","Changed"),session.cookie,csrf).statusCode.value())
        assertEquals(400,exchange("/api/v1/user/catalog/products/${v.second}",HttpMethod.PUT,body("ACTIVE","FUTURE","Changed"),session.cookie,csrf).statusCode.value())
        val productConflict=body("ARCHIVED","ACTIVE","Changed").replace("\"name\":\"Changed\"", "\"name\":\"Changed\",\"active\":true")
        val variantConflict=body("ACTIVE","INACTIVE","Changed").replace("\"name\":\"Stored variant\"", "\"name\":\"Stored variant\",\"active\":true")
        assertEquals(400,exchange("/api/v1/user/catalog/products/${v.second}",HttpMethod.PUT,productConflict,session.cookie,csrf).statusCode.value())
        assertEquals(400,exchange("/api/v1/user/catalog/products/${v.second}",HttpMethod.PUT,variantConflict,session.cookie,csrf).statusCode.value())
        val unchanged=catalog.product(v.second,true)!!;assertEquals(ProductStatus.ARCHIVED,unchanged.status);assertEquals("Stored",unchanged.name);assertEquals(VariantStatus.INACTIVE,unchanged.variants.single().status)
        val independent=body("ARCHIVED","ACTIVE").replace("\"name\":\"Stored\"", "\"name\":\"Stored\",\"active\":false").replace("\"name\":\"Stored variant\"", "\"name\":\"Stored variant\",\"active\":true")
        val distinct=data(exchange("/api/v1/user/catalog/products/${v.second}",HttpMethod.PUT,independent,session.cookie,csrf))
        assertEquals("ARCHIVED",distinct.path("status").asText());assertEquals("ACTIVE",distinct.path("variants").first().path("status").asText())
    }
    @Test fun `page loads collections in bounded batch queries rather than per product`() {
        val name="BATCH-${UUID.randomUUID()}"
        repeat(12) { val p=product(name);repeat(3) { variant(p,"Variant $it") } }
        val count=java.util.concurrent.atomic.AtomicInteger()
        val delegate=jdbc.dataSource!!
        val source=object:org.springframework.jdbc.datasource.DelegatingDataSource(delegate) {
            override fun getConnection():java.sql.Connection {
                val connection=delegate.connection
                return java.lang.reflect.Proxy.newProxyInstance(java.sql.Connection::class.java.classLoader,arrayOf(java.sql.Connection::class.java)) { _,method,args ->
                    if(method.name=="prepareStatement") count.incrementAndGet()
                    try { method.invoke(connection,*(args ?: emptyArray())) } catch(error:java.lang.reflect.InvocationTargetException) { throw error.targetException }
                } as java.sql.Connection
            }
        }
        val batchReader=JdbcCatalogProjectionReader(JdbcTemplate(source),mapper)
        val page=batchReader.list(true,query=name)
        assertEquals(12,page.items.size);assertTrue(page.items.all{it.variants.size==3});assertEquals(4,count.get())
    }
    @Test fun `writer preserves attribute order and direct legacy writes get stable canonical order`() {
        val p=product();val v=variant(p,"Attributes")
        catalog.saveProduct(v.second,"Attribute roundtrip","","","",emptyList(),listOf(mapOf("sku" to v.second,"name" to "Attributes","attributes" to linkedMapOf("zz" to "last","a" to "first","middle" to "value"))),mapOf("base" to 100),true,1)
        assertEquals(listOf("zz","a","middle"),catalog.product(v.second)!!.variants.single().attributes.keys.toList())
        assertEquals("Attributes",catalog.product(v.second)!!.variants.single().name)
        jdbc.update("UPDATE product_variants SET attributes=?::jsonb,attribute_order='{}' WHERE id=?","""{"zz":"last","a":"first","middle":"value"}""",v.first)
        assertEquals(listOf("a","middle","zz"),catalog.product(v.second)!!.variants.single().attributes.keys.toList())
    }
    @Test fun `local offer projection matches local pricing authority and ignores inactive offers`() {
        val session=provision();activate("STOREFRONT",session)
        val p=product();val v=variant(p,"Offer")
        val offer=jdbc.queryForObject("""INSERT INTO offers(name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,created_by,approved_by,approved_at) VALUES ('Local offer','ACTIVE',3,now()-interval '1 hour',now()+interval '1 hour','PERCENT',20,0,?,?,now()) RETURNING id""",Long::class.java,session.userId,session.userId)!!
        jdbc.update("INSERT INTO offer_products VALUES (?,?)",offer,p)
        val price=data(get("/api/v1/catalog/products/${v.second}")).path("price")
        assertEquals(100,price.path("base").asInt());assertEquals(100,price.path("original").asInt());assertEquals(80,price.path("effective").asInt());assertEquals(offer.toString(),price.path("offer").path("id").asText())
        jdbc.update("UPDATE offers SET status='PAUSED' WHERE id=?",offer)
        val after=data(get("/api/v1/catalog/products/${v.second}")).path("price");assertTrue(after.path("offer").isNull);assertEquals(100,after.path("effective").asInt())
    }
    @Test fun `admin endpoints require USER authorization and capability`() {
        assertEquals(401,get("/api/v1/user/catalog").statusCode.value());assertEquals(401,get("/api/v1/user/inventory").statusCode.value());assertEquals(401,get("/api/v1/user/catalog/products/nope").statusCode.value())
        val email="customer-${UUID.randomUUID()}@example.invalid"
        jdbc.update("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Catalog','Customer')",email,passwords.hash("a-very-long-password".toCharArray()))
        val login=exchange("/api/v1/customer/auth/login",HttpMethod.POST,"""{"email":"$email","password":"a-very-long-password"}""")
        assertEquals(200,login.statusCode.value(),login.body)
        val cookie=login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
        assertEquals(401,get("/api/v1/user/catalog",cookie).statusCode.value());assertEquals(401,get("/api/v1/user/inventory",cookie).statusCode.value())
        val admin=provision();activate("CATALOG",admin)
        val version=jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='CATALOG'",Int::class.java)!!
        val sessionId=jdbc.queryForObject("SELECT id FROM identity_sessions WHERE user_id=? AND revoked_at IS NULL",UUID::class.java,admin.userId)!!
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)",{_,_->},admin.userId,sessionId,"CATALOG",version,"DISABLED","{}",UUID.randomUUID(),"test")
        assertEquals(409,get("/api/v1/user/catalog",admin.cookie).statusCode.value());activate("CATALOG",admin)
    }
    private fun product(name:String="PARITY-${UUID.randomUUID()}",status:String="ACTIVE")=jdbc.queryForObject("INSERT INTO products(name,slug,base_price,status) VALUES (?,?,100,?) RETURNING id",Long::class.java,name,"parity-${UUID.randomUUID()}",status)!!
    private fun variant(product:Long,label:String,active:Boolean=true):Pair<Long,String> { val sku="PARITY-${UUID.randomUUID()}";return jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,?) RETURNING id",Long::class.java,product,sku,label,active)!! to sku }
    private fun data(response:ResponseEntity<String>):com.fasterxml.jackson.databind.JsonNode { assertEquals(200,response.statusCode.value(),response.body);return mapper.readTree(response.body!!).path("data") }
    private fun get(path:String,cookie:String?=null)=exchange(path,HttpMethod.GET,null,cookie)
    private fun exchange(path:String,method:HttpMethod,body:String?=null,cookie:String?=null,csrf:String?=null)=http.exchange(URI("http://localhost:$port$path"),method,HttpEntity(body,HttpHeaders().apply{contentType=MediaType.APPLICATION_JSON;set(HttpHeaders.ORIGIN,"http://localhost:4200");cookie?.let{set(HttpHeaders.COOKIE,it)};csrf?.let{set("X-CSRF-Token",it)}}),String::class.java)
    private data class Session(val cookie:String,val userId:Long,val csrf:String)
    private fun provision(role:String="ADMIN"):Session {
        val email="parity-${UUID.randomUUID()}@example.invalid";val hash=passwords.hash("a-very-long-password".toCharArray())
        val id=jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Catalog','User') RETURNING id",Long::class.java,email,hash)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",id,role)
        val login=exchange("/api/v1/internal/auth/login",HttpMethod.POST,"""{"email":"$email","password":"a-very-long-password"}""")
        assertEquals(200,login.statusCode.value(),login.body)
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'),id,login.headers.getFirst("X-CSRF-Token")!!)
    }
    private fun activate(module:String,admin:Session) {
        if(jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?",String::class.java,module)=="ACTIVE") return
        val version=jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?",Int::class.java,module)!!
        val session=jdbc.queryForObject("SELECT id FROM identity_sessions WHERE user_id=? AND revoked_at IS NULL",UUID::class.java,admin.userId)!!
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)",{_,_->},admin.userId,session,module,version,"ACTIVE","{}",UUID.randomUUID(),"test")
    }
    companion object {
        private val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry:DynamicPropertyRegistry) {
            postgres.start();registry.add("spring.datasource.url"){postgres.jdbcUrl};registry.add("spring.datasource.username"){postgres.username};registry.add("spring.datasource.password"){postgres.password}
        }
    }
}
