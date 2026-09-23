package com.storecore.blackstore.infrastructure

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

@Component
class JdbcBlackStoreCompanionStore(private val jdbc: JdbcTemplate) {
    fun liveCompanionCount(): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_companions WHERE status <> 'REVOKED'", Int::class.java) ?: 0

    fun operationCount(): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations", Int::class.java) ?: 0

    fun externalLedgerCount(): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE'", Int::class.java) ?: 0

    fun assertNoLiveTraffic() {
        check(operationCount() == 0)
        check(externalLedgerCount() == 0)
    }
}
