package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.BlackStoreSagaException
import com.storecore.blackstore.application.port.BlackStoreCompanionGuard
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcBlackStoreCompanionStore(
    private val jdbc: JdbcTemplate,
) : BlackStoreCompanionGuard {

    fun liveCompanionCount(): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_companions WHERE status <> 'REVOKED'", Int::class.java) ?: 0

    fun operationCount(): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations", Int::class.java) ?: 0

    fun externalLedgerCount(): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE'", Int::class.java) ?: 0

    override fun assertNoLiveTraffic() {
        check(operationCount() == 0)
        check(externalLedgerCount() == 0)
    }

    override fun assertBound(clientInstanceId: UUID) {
        val live = jdbc.query(
            "SELECT client_instance_id FROM blackstore_companions WHERE status <> 'REVOKED'",
            { rs, _ -> rs.getObject("client_instance_id", UUID::class.java) },
        )
        if (live.size != 1 || live.single() != clientInstanceId) {
            throw BlackStoreSagaException("FORBIDDEN", 403, retryable = false)
        }
    }
}
