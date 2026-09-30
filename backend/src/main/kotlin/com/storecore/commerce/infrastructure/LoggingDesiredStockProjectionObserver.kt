package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.port.DesiredStockProjectionObserver
import com.storecore.commerce.domain.DesiredStockOutcome
import com.storecore.commerce.domain.DesiredStockProjectionResult
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class LoggingDesiredStockProjectionObserver : DesiredStockProjectionObserver {
    private val counts = ConcurrentHashMap<String, AtomicLong>()

    override fun record(results: List<DesiredStockProjectionResult>) {
        results.forEach { result ->
            counts.computeIfAbsent(result.outcome.wire) { AtomicLong() }.incrementAndGet()
            log.info(
                "desired_stock outcome={} listingId={} version={} remote_delivery=false",
                result.outcome.wire,
                result.listingId,
                result.projectionVersion,
            )
        }
    }

    fun count(outcome: DesiredStockOutcome): Long = counts[outcome.wire]?.get() ?: 0L

    companion object {
        private val log = LoggerFactory.getLogger(LoggingDesiredStockProjectionObserver::class.java)
    }
}
