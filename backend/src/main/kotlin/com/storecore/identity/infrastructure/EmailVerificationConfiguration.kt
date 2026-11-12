package com.storecore.identity.infrastructure

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.*
import com.storecore.identity.infrastructure.security.EmailVerificationAttemptBudget
import com.storecore.identity.infrastructure.security.VerificationTokens
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class EmailVerificationConfiguration {
    @Bean
    @ConditionalOnMissingBean(VerificationTokenPort::class)
    fun verificationTokens(): VerificationTokenPort = VerificationTokens()

    @Bean
    fun emailVerificationRepository(
        jdbc: JdbcTemplate,
        locks: IdentityMutationLocks,
        tokens: VerificationTokenPort,
    ): EmailVerificationRepository = JdbcEmailVerificationRepository(jdbc, locks, tokens)

    @Bean
    fun emailVerificationBudget(): EmailVerificationBudgetPort = EmailVerificationAttemptBudget()

    /**
     * A savepoint isolates neutral enqueue rejection from the coordinator's
     * outer session/CSRF transaction. REQUIRES_NEW is intentionally avoided
     * because the outer transaction already owns the subject lock.
     */
    @Bean
    fun emailVerificationTransactions(manager: PlatformTransactionManager): EmailVerificationTransactions {
        val nested = TransactionTemplate(manager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_NESTED
        }
        return object : EmailVerificationTransactions {
            override fun <T : Any> execute(effect: () -> T): T =
                nested.execute { effect() } ?: error("EMAIL_VERIFICATION_TRANSACTION_FAILED")
        }
    }

    @Bean
    fun identityDeliveryPolicy(): IdentityDeliveryPolicy = IdentityDeliveryPolicy { Math.random() }

    @Bean
    fun identityDeliveryQueue(
        jdbc: JdbcTemplate,
        settings: IdentityDeliverySettings,
        tokens: VerificationTokenPort,
        policy: IdentityDeliveryPolicy,
        manager: PlatformTransactionManager,
    ): IdentityDeliveryQueue = JdbcIdentityDeliveryQueue(
        jdbc,
        settings.installationId,
        tokens,
        policy,
        TransactionTemplate(manager),
    )

    @Bean
    fun emailVerificationDelivery(
        jdbc: JdbcTemplate,
        settings: IdentityDeliverySettings,
        readiness: IdentityDeliveryReadiness,
        encryptions: ObjectProvider<IdentityMessageEncryption>,
        codecs: ObjectProvider<IdentityMessagePayloadCodec>,
    ): EmailVerificationDeliveryPort {
        val encryption = encryptions.ifAvailable
        val codec = codecs.ifAvailable
        if (encryption == null || codec == null) return unavailableVerificationDelivery()
        return JdbcEmailVerificationDelivery(jdbc, readiness, settings.installationId, encryption, codec)
    }

    @Bean
    fun emailVerificationUseCases(
        repository: EmailVerificationRepository,
        delivery: EmailVerificationDeliveryPort,
        budgets: EmailVerificationBudgetPort,
        tokens: VerificationTokenPort,
        transactions: EmailVerificationTransactions,
    ): EmailVerificationUseCases = EmailVerificationService(
        repository,
        RequestEmailVerificationStep(repository, delivery, budgets, transactions),
        InspectEmailVerificationStep(repository, budgets, tokens),
        CompleteEmailVerificationStep(repository, budgets, tokens, transactions),
    )

    @Bean
    fun identityDeliveryReaper(queue: IdentityDeliveryQueue, operations: IdentityDeliveryOperationalMetrics): IdentityDeliveryReaper =
        IdentityDeliveryReaper(queue, Clock.systemUTC(), operations)

    private fun unavailableVerificationDelivery() = object : EmailVerificationDeliveryPort {
        override val readiness = EmailDeliveryReadiness.UNAVAILABLE
        override fun enqueue(dispatch: EmailVerificationDispatch) = EmailDeliveryReadiness.UNAVAILABLE
    }
}

/** Cleanup remains active even while outbound SMTP delivery is disabled. */
class IdentityDeliveryReaper(
    private val queue: IdentityDeliveryQueue,
    private val clock: Clock,
    private val operations: IdentityDeliveryOperationalMetrics,
) {
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    fun reap() {
        try {
            operations.reaperSucceeded(queue.reapExpired(clock.instant()))
        } catch (_: Exception) {
            operations.reaperFailed()
        }
    }
}
