package com.storecore.catalog.infrastructure.media

import com.storecore.catalog.application.media.ExternalMediaIoGuard
import org.springframework.transaction.support.TransactionSynchronizationManager

class SpringExternalMediaIoGuard : ExternalMediaIoGuard {
    override fun requireNoActiveTransaction() {
        check(!TransactionSynchronizationManager.isActualTransactionActive()) {
            "MEDIA_EXTERNAL_IO_REQUIRES_COMMITTED_REGISTRATION"
        }
    }
}
