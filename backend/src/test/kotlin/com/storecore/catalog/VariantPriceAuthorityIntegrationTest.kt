package com.storecore.catalog

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.application.SkuPriceAuthority
import com.storecore.catalog.domain.*
import com.storecore.catalog.infrastructure.JdbcCatalogService
import com.storecore.commerce.infrastructure.JdbcCartService
import com.storecore.favorites.infrastructure.JdbcFavoriteRepository
import com.storecore.identity.domain.CustomerPrincipal
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigDecimal
import java.util.UUID

@SpringBootTest(properties=["storecore.installation-guard.enabled=false"])
@Transactional
class VariantPriceAuthorityIntegrationTest @Autowired constructor(
    private val jdbc: JdbcTemplate,
    private val catalog: JdbcCatalogService,
    private val authority: SkuPriceAuthority,
    private val carts: JdbcCartService,
    private val favorites: JdbcFavoriteRepository,
    private val mapper: ObjectMapper,
) {
    @Test fun `catalog authority cart and favorites select same deterministic active offer per base`() {
        val a="O-${UUID.randomUUID()}";val b="O-${UUID.randomUUID()}"
        save(a,listOf(mapOf("sku" to a),mapOf("sku" to b,"priceCommand" to mapOf("mode" to "OVERRIDE","base" to "50.00"))))
        val productId=jdbc.queryForObject("SELECT product_id FROM product_variants WHERE sku=?",Long::class.java,a)!!
        val actor=jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Offer','Admin') RETURNING id",Long::class.java,"${UUID.randomUUID()}@example.invalid","\$argon2id\$test")!!
        fun offer(priority:Int,kind:String,value:String,expired:Boolean=false):Long {
            val id=jdbc.queryForObject("INSERT INTO offers(name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,created_by,approved_by,approved_at) VALUES ('Offer','ACTIVE',?,now()-interval '2 days',CASE WHEN ? THEN now()-interval '1 day' ELSE now()+interval '1 day' END,?,?,0,?, ?,now()) RETURNING id",Long::class.java,priority,expired,kind,BigDecimal(value),actor,actor)!!
            jdbc.update("INSERT INTO offer_products(offer_id,product_id) VALUES (?,?)",id,productId)
            return id
        }
        val winner=offer(5,"FIXED","75.00")
        offer(5,"PERCENT","10.00")
        offer(10,"PERCENT","99.00",true)
        val detail=catalog.product(b,true)!!
        for(variant in detail.variants) {
            val quote=authority.resolve(variant.sku)!!.resolution.knownPrice()!!
            assertEquals(variant.price.knownPrice(),quote)
            assertEquals(winner.toString(),quote.offer!!.id)
        }
        assertEquals(BigDecimal("25.00"),authority.resolve(a)!!.resolution.knownPrice()!!.effective)
        assertEquals(BigDecimal("0.00"),authority.resolve(b)!!.resolution.knownPrice()!!.effective)
        jdbc.update("UPDATE offers SET status='PAUSED' WHERE id=?",winner)
        assertEquals(BigDecimal("90.00"),authority.resolve(a)!!.resolution.knownPrice()!!.effective)
        assertEquals(BigDecimal("45.00"),authority.resolve(b)!!.resolution.knownPrice()!!.effective)
    }
    @Test fun `unrepresentable stored money is Unknown everywhere and cannot overwrite cart`() {
        val sku="U-${UUID.randomUUID()}"
        save(sku,listOf(mapOf("sku" to sku)))
        val id=jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Test','Buyer') RETURNING id",Long::class.java,"${UUID.randomUUID()}@example.invalid","\$argon2id\$test")!!
        val customer=CustomerPrincipal(UUID.randomUUID(),id)
        carts.putItem(customer,sku,2)
        favorites.add(customer,sku)
        jdbc.execute("ALTER TABLE product_variants DROP CONSTRAINT ck_variant_base_price_override")
        jdbc.update("UPDATE product_variants SET base_price_override='NaN'::numeric WHERE sku=?",sku)
        assertTrue(catalog.product(sku,true)!!.variants.single().price is SkuPriceResolution.Unknown)
        assertTrue(authority.resolve(sku)!!.resolution is SkuPriceResolution.Unknown)
        assertThrows(com.storecore.commerce.application.CommerceValidation::class.java) { carts.putItem(customer,sku,5) }
        assertEquals(2,carts.read(customer).lines.single().quantity)
        assertEquals(BigDecimal("100.00"),carts.read(customer).lines.single().effectiveUnitPrice)
        val favorite=favorites.list(customer).single()
        assertNull(favorite.price)
        assertTrue(favorite.priceResolution is SkuPriceResolution.Unknown)
        favorites.remove(customer,sku)
        assertTrue(favorites.list(customer).isEmpty())
    }
    companion object {
        private val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine").apply { start() }
        @JvmStatic @DynamicPropertySource fun database(registry:DynamicPropertyRegistry) {
            registry.add("spring.datasource.url",postgres::getJdbcUrl)
            registry.add("spring.datasource.username",postgres::getUsername)
            registry.add("spring.datasource.password",postgres::getPassword)
        }
    }
    private fun save(sku:String,variants:List<Map<String,Any?>>,name:String="Product") = catalog.saveProduct(sku,name,"","","",emptyList(),variants,emptyMap(),true,1,productBasePrice=mapper.readTree("100"))
    @Test fun `parent price override preservation clearing and quote wire stay independent`() {
        val a="A-${UUID.randomUUID()}";val b="B-${UUID.randomUUID()}"
        save(a,listOf(mapOf("sku" to a),mapOf("sku" to b,"priceCommand" to mapOf("mode" to "OVERRIDE","base" to "200.00"))))
        val detail=catalog.product(b,true)!!
        assertEquals(BigDecimal("100.00"),detail.productBasePrice)
        assertEquals(BigDecimal("200.00"),detail.price!!.effective)
        assertEquals(BigDecimal("100.00"),authority.resolve(a)!!.resolution.knownPrice()!!.effective)
        val wire=mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(detail)
        assertEquals("KNOWN",wire.path("variants").last().path("price").path("state").asText())
        assertEquals(200,wire.path("variants").last().path("price").path("price").path("effective").asInt())
        save(b,listOf(mapOf("sku" to b)),"Only name changed")
        assertEquals(BigDecimal("100.00"),catalog.product(a,true)!!.productBasePrice)
        assertEquals(BigDecimal("200.00"),authority.resolve(b)!!.resolution.knownPrice()!!.effective)
        save(b,listOf(mapOf("sku" to b,"priceCommand" to mapOf("mode" to "INHERIT"))))
        assertEquals(BigDecimal("100.00"),authority.resolve(b)!!.resolution.knownPrice()!!.effective)
    }
    @Test fun `cart and favorite quote exact SKU and retired favorite remains removable`() {
        val sku="V-${UUID.randomUUID()}"
        save(sku,listOf(mapOf("sku" to sku,"priceCommand" to mapOf("mode" to "OVERRIDE","base" to "230.25"))))
        val id=jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Test','Buyer') RETURNING id",Long::class.java,"${UUID.randomUUID()}@example.invalid","\$argon2id\$test")!!
        val customer=CustomerPrincipal(UUID.randomUUID(),id)
        val cart=carts.putItem(customer,sku,2)
        assertEquals(BigDecimal("230.25"),cart.lines.single().effectiveUnitPrice)
        favorites.add(customer,sku)
        assertEquals(BigDecimal("230.25"),favorites.list(customer).single().price)
        jdbc.update("UPDATE product_variants SET active=false WHERE sku=?",sku)
        val retired=favorites.list(customer).single()
        assertNull(retired.price)
        assertEquals(com.storecore.favorites.domain.FavoriteAvailability.UNAVAILABLE,retired.availability)
        favorites.remove(customer,sku)
        assertTrue(favorites.list(customer).isEmpty())
    }
}

