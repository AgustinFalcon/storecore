package com.storecore.identity

import com.storecore.identity.application.RecoveryDeliveryPort
import com.storecore.identity.domain.RecoveryDeliveryState
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterEach
import org.apache.hc.client5.http.impl.classic.HttpClients
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory
import org.junit.jupiter.api.TestMethodOrder
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class RecoveryUnavailableHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val delivery: RecoveryDeliveryPort,
    @LocalServerPort private val port: Int,
) {
    private val noRetryClient = HttpClients.custom().disableAutomaticRetries().build()
    @BeforeEach fun disableRetries() { http.restTemplate.requestFactory = HttpComponentsClientHttpRequestFactory(noRetryClient) }
    @AfterEach fun closeClient() { noRetryClient.close() }
    @Test @Order(1) fun `production default is globally unavailable without authorization or fake activation`() {
        assertEquals(RecoveryDeliveryState.UNCONFIGURED, delivery.state)
        jdbc.update("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES ('known-recovery@example.test',?,'Known','Customer')",
            com.storecore.identity.infrastructure.security.Argon2PasswordHasher().hash("a-valid-test-password".toCharArray()))
        val headers = HttpHeaders().apply { contentType = MediaType.APPLICATION_JSON; setOrigin("http://localhost:4200") }
        val responses = listOf("known-recovery@example.test", "absent-recovery@example.test").map { email ->
            http.exchange("http://localhost:$port/api/v1/customer/auth/recovery/requests", HttpMethod.POST, HttpEntity("""{"email":"$email"}""", headers), String::class.java)
        }
        responses.forEach { assertEquals(503, it.statusCode.value()); assertEquals("no-store", it.headers.cacheControl); assertEquals(responses.first().body, it.body) }
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_recovery_tokens", Int::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_sessions", Int::class.java))
    }
    @Test @Order(2) fun `HTTP aggregate limits survive destination rotation and include retry headers`() {
        val headers = HttpHeaders().apply { contentType = MediaType.APPLICATION_JSON; setOrigin("http://localhost:4200") }
        var limited: ResponseEntity<String>? = null
        for (index in 1..70) {
            val response = http.exchange("http://localhost:$port/api/v1/customer/auth/recovery/requests", HttpMethod.POST, HttpEntity("""{"email":"rotate-$index@example.test"}""", headers), String::class.java)
            if (response.statusCode.value() == 429) { limited = response; break }
            assertEquals(503, response.statusCode.value())
        }
        assertNotNull(limited)
        assertTrue(limited!!.headers.getFirst("Retry-After")!!.toLong() > 0)
        assertEquals("no-store", limited!!.headers.cacheControl)
        repeat(120) { index ->
            val response = http.exchange("http://localhost:$port/api/v1/customer/auth/recovery/inspect", HttpMethod.POST, HttpEntity("""{"token":"invalid-$index"}""", headers), String::class.java)
            assertEquals(200, response.statusCode.value())
        }
        val tokenLimit = http.exchange("http://localhost:$port/api/v1/customer/auth/recovery/inspect", HttpMethod.POST, HttpEntity("""{"token":"another-invalid"}""", headers), String::class.java)
        assertEquals(429, tokenLimit.statusCode.value())
        assertNotNull(tokenLimit.headers.getFirst("Retry-After"))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_recovery_tokens", Int::class.java))
    }
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
