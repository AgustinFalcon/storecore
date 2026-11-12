package com.storecore.identity.infrastructure

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.security.*
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import java.time.Clock
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry

enum class IdentityDeliveryReadinessReason { READY, UNCONFIGURED, CAPABILITY_DISABLED, WORKER_DISABLED, QUEUE_UNAVAILABLE, INVALID_CONFIGURATION }

class IdentityDeliveryReadiness(private val settings: IdentityDeliverySettings, private val queueAvailable: () -> Boolean) {
    init { settings.validate() }
    fun reason(capability: EmailDeliveryCapability): IdentityDeliveryReadinessReason = when {
        settings.mode == EmailDeliveryMode.UNCONFIGURED -> IdentityDeliveryReadinessReason.UNCONFIGURED
        !settings.mode.readiness(capability).permitsEnqueue -> IdentityDeliveryReadinessReason.CAPABILITY_DISABLED
        !settings.workerEnabled -> IdentityDeliveryReadinessReason.WORKER_DISABLED
        !queueAvailable() -> IdentityDeliveryReadinessReason.QUEUE_UNAVAILABLE
        else -> IdentityDeliveryReadinessReason.READY
    }
    fun state(capability: EmailDeliveryCapability) = if (reason(capability) == IdentityDeliveryReadinessReason.READY) EmailDeliveryReadiness.READY else EmailDeliveryReadiness.UNAVAILABLE
}

/** Not a data class: default diagnostic output must never contain property values. */
class IdentityDeliverySettings(
    val mode: EmailDeliveryMode = EmailDeliveryMode.UNCONFIGURED,
    val workerEnabled: Boolean = false,
    val host: String = "", val port: Int = 0, val tls: IdentitySmtpTls = IdentitySmtpTls.Unknown,
    val username: String = "", val password: String = "", val sender: String = "",
    val origin: String = "", val installationId: String = "",
    val activeKeyId: String = "", private val encodedKeys: Map<String, String> = emptyMap(),
    val deliveryEvidenceRef: String = "", val historicalAccessProcedureRef: String = "",
) {
    fun validate() {
        require(mode != EmailDeliveryMode.Unknown) { "IDENTITY_DELIVERY_INVALID_MODE" }
        if (mode == EmailDeliveryMode.UNCONFIGURED) {
            require(!workerEnabled) { "IDENTITY_DELIVERY_WORKER_REQUIRES_CONFIGURATION" }
            return
        }
        require(validHost(host) && port in 1..65535 && tls != IdentitySmtpTls.Unknown &&
            username.isNotBlank() && password.isNotBlank() && '\r' !in username && '\n' !in username &&
            validMailbox(sender) && installationId.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,127}"))) { "IDENTITY_DELIVERY_INVALID_CONFIGURATION" }
        LocalIdentityMessageRenderer(origin)
        keyring().use { }
        if (mode == EmailDeliveryMode.RECOVERY_ENABLED) require(deliveryEvidenceRef.isNotBlank() && historicalAccessProcedureRef.isNotBlank()) { "IDENTITY_DELIVERY_ROLLOUT_EVIDENCE_REQUIRED" }
    }
    fun keyring(): IdentityMessageKeyring {
        val decoded = mutableMapOf<String, ByteArray>()
        try {
            encodedKeys.forEach { (id, value) -> decoded[id] = Base64.getDecoder().decode(value) }
            return IdentityMessageKeyring(activeKeyId, decoded)
        } catch (_: Exception) { throw IllegalArgumentException("IDENTITY_DELIVERY_INVALID_KEYRING") }
        finally { decoded.values.forEach { it.fill(0) } }
    }
    override fun toString() = "IdentityDeliverySettings(REDACTED)"
    companion object {
        // Single bare ASCII mailbox; no display names, comments, lists or header injection.
        fun validMailbox(value: String): Boolean {
            val local = value.substringBefore('@')
            val domain = value.substringAfter('@', "")
            return value.length <= 254 && local.length in 1..64 && !local.startsWith('.') && !local.endsWith('.') && ".." !in local &&
                local.matches(Regex("[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+")) && validHost(domain) &&
                validTopLevel(domain.substringAfterLast('.')) && '.' in domain
        }
        private fun validTopLevel(value: String) = value.matches(Regex("[A-Za-z]{2,63}")) ||
            value.matches(Regex("xn--[A-Za-z0-9](?:[A-Za-z0-9-]{0,57}[A-Za-z0-9])?", RegexOption.IGNORE_CASE))
        private fun validHost(value: String) = value.length in 1..253 && value.split('.').all { label ->
            label.length in 1..63 && label.matches(Regex("[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"))
        }
    }
}

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class IdentityDeliveryConfiguration {
    @Bean fun identityDeliverySettings(environment: Environment): IdentityDeliverySettings {
        fun prop(name: String, default: String = "") = environment.getProperty("storecore.identity.delivery.$name", default)
        val ids = prop("key-ids").split(',').map(String::trim).filter(String::isNotEmpty)
        val settings = IdentityDeliverySettings(
            EmailDeliveryMode.fromWire(prop("mode", "UNCONFIGURED")), prop("worker-enabled", "false") == "true",
            prop("smtp.host"), prop("smtp.port").toIntOrNull() ?: 0, IdentitySmtpTls.fromWire(prop("smtp.tls")),
            prop("smtp.username"), prop("smtp.password"), prop("smtp.sender"), prop("origin"), prop("installation-id"),
            prop("active-key-id"), ids.associateWith { prop("keys.$it") }, prop("delivery-evidence-ref"), prop("historical-access-procedure-ref"),
        )
        settings.validate()
        return settings
    }
    @Bean fun identityDeliveryReadiness(settings: IdentityDeliverySettings, queues: ObjectProvider<IdentityDeliveryQueue>) =
        IdentityDeliveryReadiness(settings) { queues.ifAvailable != null }
    @Bean fun identityDeliveryOperationalMetrics(jdbc: ObjectProvider<JdbcTemplate>, registries: ObjectProvider<MeterRegistry>) =
        IdentityDeliveryOperationalMetrics(jdbc.ifAvailable, registries.ifAvailable ?: SimpleMeterRegistry())

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(name = ["storecore.identity.delivery.mode"], havingValue = "VERIFICATION_ONLY")
    class VerificationMode : ConfiguredIdentityDeliveryBeans()

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(name = ["storecore.identity.delivery.mode"], havingValue = "RECOVERY_ENABLED")
    class RecoveryMode : ConfiguredIdentityDeliveryBeans()
}

/** Validation is entirely local: startup never opens a network connection or sends mail. */
open class ConfiguredIdentityDeliveryBeans {
    @Bean(destroyMethod = "close") fun identityMessageKeyring(settings: IdentityDeliverySettings, jdbc: JdbcTemplate): IdentityMessageKeyring {
        val keyring = settings.keyring()
        try {
            // Expired payloads are no longer deliverable and need no retired KEK. Cancel and
            // crypto-shred them atomically before checking keys required by live work.
            jdbc.update(EXPIRE_UNDELIVERABLE_SQL)
            keyring.requireReadable(jdbc.queryForList(ACTIVE_KEY_IDS_SQL, String::class.java).toSet())
            if (settings.mode == EmailDeliveryMode.RECOVERY_ENABLED) {
                val verifiedAdmin = jdbc.queryForObject(
                    """SELECT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
                       JOIN identity_email_verification_evidence e ON e.user_id=u.id AND e.realm='USER'
                       WHERE u.active AND r.code='ADMIN' AND e.email_version=u.email_version
                       AND e.email_digest=encode(sha256(convert_to(u.email,'UTF8')),'hex'))""", Boolean::class.java,
                ) == true
                require(verifiedAdmin) { "IDENTITY_DELIVERY_VERIFIED_ADMIN_REQUIRED" }
            }
            return keyring
        } catch (_: Exception) { keyring.close(); throw IllegalStateException("IDENTITY_DELIVERY_PREFLIGHT_FAILED") }
    }
    @Bean @ConditionalOnMissingBean(IdentityMessageEncryption::class)
    fun identityMessageEncryption(keyring: IdentityMessageKeyring): IdentityMessageEncryption = AesGcmIdentityMessageEncryption(keyring)
    @Bean @ConditionalOnMissingBean(IdentityMessagePayloadCodec::class)
    fun identityMessagePayloadCodec(): IdentityMessagePayloadCodec = JsonIdentityMessagePayloadCodec()
    @Bean @ConditionalOnMissingBean(IdentitySmtpTransport::class)
    fun identitySmtp(settings: IdentityDeliverySettings): IdentitySmtpTransport = SmtpIdentityTransport(settings)
    @Bean fun identityMessageRenderer(settings: IdentityDeliverySettings) = LocalIdentityMessageRenderer(settings.origin)
    @Bean fun identityDeliveryObserver(registry: MeterRegistry): IdentityDeliveryObserver = IdentityDeliveryObserver { state, error ->
        registry.counter("storecore.identity.delivery.settlements", "state", state.name, "reason", error.name).increment()
    }
    @Bean
    @ConditionalOnProperty(name = ["storecore.identity.delivery.worker-enabled"], havingValue = "true")
    fun identityDeliveryScheduler(queues: ObjectProvider<IdentityDeliveryQueue>, encryption: IdentityMessageEncryption, codec: IdentityMessagePayloadCodec,
        renderer: LocalIdentityMessageRenderer, smtp: IdentitySmtpTransport, readiness: IdentityDeliveryReadiness,
        observer: IdentityDeliveryObserver, operations: IdentityDeliveryOperationalMetrics): IdentityDeliveryScheduler? {
        val queue = queues.ifAvailable ?: return null
        return IdentityDeliveryScheduler(IdentityDeliveryWorker(queue, DecryptIdentityDeliveryStep(encryption, codec), renderer, smtp,
            IdentityDeliveryPolicy { Math.random() }, Clock.systemUTC(), observer), readiness, operations)
    }

    companion object {
        internal val EXPIRE_UNDELIVERABLE_SQL = """WITH expired AS (
            SELECT d.event_id FROM identity_message_delivery d
            JOIN identity_message_outbox o ON o.id=d.event_id
            WHERE d.state IN ('PENDING','RETRY','LEASED') AND o.expires_at<=clock_timestamp()
            FOR UPDATE OF d
        ) UPDATE identity_message_delivery d
          SET state='CANCELLED',lease_owner=NULL,lease_until=NULL,last_error='EXPIRED',
              updated_at=clock_timestamp(),terminal_at=clock_timestamp()
          FROM expired e WHERE d.event_id=e.event_id""".trimIndent()
        internal val ACTIVE_KEY_IDS_SQL = """SELECT DISTINCT s.key_id
            FROM identity_message_secret s
            JOIN identity_message_delivery d ON d.event_id=s.event_id
            JOIN identity_message_outbox o ON o.id=s.event_id
            WHERE d.state IN ('PENDING','RETRY','LEASED') AND o.expires_at>clock_timestamp()""".trimIndent()
    }
}

class IdentityDeliveryScheduler(
    private val worker: IdentityDeliveryWorker,
    private val readiness: IdentityDeliveryReadiness,
    private val operations: IdentityDeliveryOperationalMetrics,
) {
    private val owner = UUID.randomUUID()
    @Scheduled(fixedDelay = 1000, initialDelay = 1000)
    fun tick() {
        if (!readiness.state(EmailDeliveryCapability.EMAIL_VERIFICATION).permitsEnqueue) return
        // One bounded delivery at a time; never log an exception or plaintext context.
        try {
            worker.runOnce(owner)
            operations.workerSucceeded()
        } catch (_: Exception) {
            operations.workerFailed()
        }
    }
}

/** Aggregate-only operational telemetry: no event IDs, recipients, tokens or exception text. */
class IdentityDeliveryOperationalMetrics(private val jdbc: JdbcTemplate?, registry: MeterRegistry) {
    private val stateCounts = ConcurrentHashMap<IdentityOutboxState, AtomicLong>()
    private val oldestActiveSeconds = AtomicLong()
    private val lastWorkerSuccessEpochSeconds = AtomicLong()
    private val lastReaperSuccessEpochSeconds = AtomicLong()
    private val workerFailures = registry.counter("storecore.identity.delivery.worker.failures")
    private val reaperFailures = registry.counter("storecore.identity.delivery.reaper.failures")
    private val reaped = registry.counter("storecore.identity.delivery.reaper.settlements", "state", IdentityOutboxState.CANCELLED.name)
    init {
        IdentityOutboxState.entries.filter { it != IdentityOutboxState.Unknown }.forEach { state ->
            val value = AtomicLong()
            stateCounts[state] = value
            registry.gauge("storecore.identity.delivery.queue", listOf(io.micrometer.core.instrument.Tag.of("state", state.name)), value)
        }
        registry.gauge("storecore.identity.delivery.oldest.active.seconds", oldestActiveSeconds)
        registry.gauge("storecore.identity.delivery.worker.last.success.epoch.seconds", lastWorkerSuccessEpochSeconds)
        registry.gauge("storecore.identity.delivery.reaper.last.success.epoch.seconds", lastReaperSuccessEpochSeconds)
    }
    fun workerSucceeded() { lastWorkerSuccessEpochSeconds.set(Clock.systemUTC().instant().epochSecond) }
    fun workerFailed() { workerFailures.increment() }
    fun reaperSucceeded(count: Int) {
        if (count > 0) reaped.increment(count.toDouble())
        lastReaperSuccessEpochSeconds.set(Clock.systemUTC().instant().epochSecond)
    }
    fun reaperFailed() { reaperFailures.increment() }
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    fun refreshQueueSnapshot() {
        val database = jdbc ?: return
        try {
            val counts = database.queryForList("SELECT state,count(*) AS total FROM identity_message_delivery GROUP BY state")
                .associate { IdentityOutboxState.fromWire(it["state"] as? String) to (it["total"] as Number).toLong() }
            stateCounts.forEach { (state, value) -> value.set(counts[state] ?: 0L) }
            val age = database.queryForObject(
                """SELECT COALESCE(EXTRACT(EPOCH FROM (clock_timestamp()-MIN(created_at))),0)::bigint
                   FROM identity_message_delivery WHERE state IN ('PENDING','RETRY','LEASED')""",
                Long::class.java,
            ) ?: 0L
            oldestActiveSeconds.set(age.coerceAtLeast(0))
        } catch (_: Exception) {
            reaperFailures.increment()
        }
    }
}
