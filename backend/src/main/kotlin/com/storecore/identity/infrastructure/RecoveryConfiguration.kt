package com.storecore.identity.infrastructure

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.JdbcRecoveryDelivery
import com.storecore.identity.infrastructure.security.RecoveryAttemptBudget
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class RecoveryConfiguration {
    @Bean @ConditionalOnMissingBean(RecoveryDeliveryPort::class)
    fun recoveryDelivery(
        jdbc: JdbcTemplate,
        settings: IdentityDeliverySettings,
        readiness: IdentityDeliveryReadiness,
        encryptions: ObjectProvider<IdentityMessageEncryption>,
        codecs: ObjectProvider<IdentityMessagePayloadCodec>,
    ): RecoveryDeliveryPort {
        val encryption = encryptions.ifAvailable
        val codec = codecs.ifAvailable
        if (!readiness.state(EmailDeliveryCapability.PASSWORD_RECOVERY).permitsEnqueue || encryption == null || codec == null) {
            return object : RecoveryDeliveryPort {
                override val state = RecoveryDeliveryState.UNCONFIGURED
                override fun deliver(dispatch: RecoveryDispatch) = RecoveryDeliveryState.UNCONFIGURED
            }
        }
        return JdbcRecoveryDelivery(jdbc, settings.mode, settings.installationId, encryption, codec)
    }
    @Bean fun recoveryBudget(): RecoveryBudgetPort = RecoveryAttemptBudget()
    @Bean fun recoveryTransactions(template: TransactionTemplate): RecoveryTransactions = object : RecoveryTransactions {
        override fun <T : Any> execute(effect: () -> T): T = template.execute { effect() } ?: error("RECOVERY_TRANSACTION_FAILED")
    }
    @Bean fun recoveryUseCases(
        repository: RecoveryRepository, delivery: RecoveryDeliveryPort, budgets: RecoveryBudgetPort,
        tokens: RecoveryTokenPort, transactions: RecoveryTransactions,
    ): RecoveryUseCases = RecoveryService(
        RequestRecoveryStep(repository, delivery, budgets, tokens, transactions),
        InspectRecoveryStep(repository, budgets, tokens),
        CompleteRecoveryStep(repository, budgets, tokens, transactions),
    )
}
