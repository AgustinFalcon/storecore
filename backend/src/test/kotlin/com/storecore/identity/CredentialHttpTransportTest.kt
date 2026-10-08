package com.storecore.identity

import com.storecore.identity.application.AccessChallengePort
import com.storecore.identity.infrastructure.UnifiedAccessCoordinator
import com.storecore.identity.infrastructure.persistence.JdbcIdentityService
import com.storecore.identity.infrastructure.security.*
import com.storecore.identity.infrastructure.web.*
import com.storecore.platform.infrastructure.web.CorsConfig
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterEach
import org.apache.hc.client5.http.impl.classic.HttpClients
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory
import org.mockito.Mockito.mock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.EnableAutoConfiguration
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Profile
import org.springframework.test.context.ActiveProfiles
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.*
import org.springframework.transaction.annotation.EnableTransactionManagement
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate
import java.net.URI
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Embedded HTTP + real MVC/AOP/use cases; JDBC and hashing are substituted. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    classes = [CredentialHttpTransportTest.Runtime::class],
    properties = ["storecore.installation.origin=http://localhost:4200"])
@ActiveProfiles("credential-http-transport-only")
class CredentialHttpTransportTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val budget: LoginAttemptBudget,
    @LocalServerPort private val port: Int,
) {
    private val noRetryClient = HttpClients.custom().disableAutomaticRetries().build()
    @BeforeEach fun disableRetries() {
        http.restTemplate.requestFactory = HttpComponentsClientHttpRequestFactory(noRetryClient)
    }
    @AfterEach fun closeTransport() = noRetryClient.close()

    @Configuration(proxyBeanMethods = false)
    @Profile("credential-http-transport-only")
    @EnableAutoConfiguration(exclude = [DataSourceAutoConfiguration::class, FlywayAutoConfiguration::class])
    @EnableTransactionManagement(proxyTargetClass = true)
    @Import(UnifiedAccessController::class, IdentityController::class, IdentityExceptionAdvice::class,
        UnifiedAccessConfiguration::class, RequestAuth::class, IdentityCookieWriter::class,
        ClientAddressResolver::class, InstallationOrigin::class, JdbcIdentityService::class,
        UnifiedAccessCoordinator::class, LoginAttemptBudget::class, ChallengeAttemptBudget::class,
        LoginRateLimiter::class, OpaqueTokenFactory::class, IdentityMutationCoordinator::class, CorsConfig::class)
    class Runtime {
        @Bean fun jdbc() = mock(JdbcTemplate::class.java)
        @Bean fun passwords() = mock(Argon2PasswordHasher::class.java)
        @Bean fun challenges() = mock(AccessChallengePort::class.java)
        @Bean fun manager(): PlatformTransactionManager = object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        }
        @Bean fun transactions(manager: PlatformTransactionManager) = TransactionTemplate(manager)
    }

    @Test fun `exact mixed credential sequence reaches one embedded server budget`() {
        val email = "transport-${System.nanoTime()}@example.com"
        credentialSequence(email)
    }

    @Test fun `exact mixed sequence remains independent after ten unknown context selections`() {
        repeat(10) {
            val challenge = java.util.UUID.randomUUID().toString() + java.util.UUID.randomUUID().toString()
            val rejected = post("/api/v1/auth/context-selection", """{"challenge":"$challenge","context":"UNKNOWN"}""")
            assertEquals(401, rejected.statusCode.value(), rejected.body)
        }
        credentialSequence("after-selection-${System.nanoTime()}@example.com")
    }

    private fun credentialSequence(email: String) {
        val paths = listOf("/api/v1/auth/login", "/api/v1/customer/auth/login", "/api/v1/internal/auth/login",
            "/api/v1/auth/login", "/api/v1/customer/auth/login")
        paths.forEachIndexed { index, path ->
            val wireEmail = if (index % 2 == 0) " ${email.uppercase(java.util.Locale.ROOT)} " else email
            val response = post(path, """{"email":"$wireEmail","password":"wrong-password-xx"}""")
            assertEquals(401, response.statusCode.value(), response.body)
        }
        val counts = counts().filterKeys { it.contains(canonicalEmailDigest(email)) }
        assertEquals(listOf(5), counts.values.toList(), "after five requests: $counts")
        val sixth = post("/api/v1/internal/auth/login", """{"email":"$email","password":"wrong-password-xx"}""")
        assertEquals(429, sixth.statusCode.value(), "budget=$counts body=${sixth.body}")
    }

    private fun post(path: String, body: String) = http.exchange(URI("http://127.0.0.1:$port$path"), HttpMethod.POST,
        HttpEntity(body, HttpHeaders().apply { contentType = MediaType.APPLICATION_JSON; setOrigin("http://localhost:4200") }), String::class.java)

    @Test fun `same request host origin still reaches application csrf denial instead of becoming fallback`() {
        val response = http.exchange(URI("http://127.0.0.1:$port/api/v1/customer/me"), HttpMethod.PUT,
            HttpEntity("""{"email":"changed@example.com","firstName":"Changed","lastName":"Test","phone":null}""",
                HttpHeaders().apply {
                    contentType = MediaType.APPLICATION_JSON
                    setOrigin("http://127.0.0.1:$port")
                    set(RequestAuth.CSRF_HEADER, "irrelevant-token")
                }), String::class.java)
        assertEquals(403, response.statusCode.value())
        assertTrue(response.body!!.contains("CSRF_INVALID"), response.body)
    }

    private fun counts(): Map<String, Int> {
        val window = budget.javaClass.getDeclaredField("window").apply { isAccessible = true }.get(budget)
        val buckets = window.javaClass.getDeclaredField("buckets").apply { isAccessible = true }.get(window) as Map<*, *>
        return buckets.mapKeys { it.key.toString() }.mapValues { (it.value as Collection<*>).size }
    }
}
