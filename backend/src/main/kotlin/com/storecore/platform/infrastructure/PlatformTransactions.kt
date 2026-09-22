package com.storecore.platform.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

@Configuration
open class PlatformTransactions {
    @Bean
    @ConditionalOnBean(PlatformTransactionManager::class)
    @ConditionalOnMissingBean
    open fun transactionTemplate(manager: PlatformTransactionManager) = TransactionTemplate(manager)
}
