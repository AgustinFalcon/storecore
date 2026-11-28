package com.storecore.loyalty.infrastructure

import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.loyalty.application.LoyaltyActionAdmissionPort
import com.storecore.loyalty.domain.LoyaltyAction
import com.storecore.loyalty.domain.LoyaltyActionAdmission
import com.storecore.loyalty.domain.LoyaltyAdmissionDecision
import com.storecore.loyalty.domain.LoyaltyKillSwitchStatus
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.sql.Timestamp
import java.time.Instant

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcLoyaltyActionAdmission(private val jdbc: JdbcTemplate) : LoyaltyActionAdmissionPort {
    override fun admit(action: LoyaltyAction, actor: CapabilityActor): LoyaltyAdmissionDecision {
        val killSwitch = readKillSwitchStatus(action)
        val moduleState = readModuleState()
        return LoyaltyActionAdmission.evaluate(action, actor, moduleState, killSwitch)
    }

    private fun readKillSwitchStatus(action: LoyaltyAction): LoyaltyKillSwitchStatus {
        val rows = jdbc.queryForList(
            """SELECT action_code, expires_at, owner, reason, removal_ticket
               FROM capability_kill_switches
               WHERE module_code='LOYALTY' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' AND active
                 AND action_code IN (?, 'POST_LEDGER')
               FOR SHARE""",
            action.wire,
        )
        if (rows.isEmpty()) return LoyaltyKillSwitchStatus.NONE
        val now = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)?.toInstant()
            ?: Instant.now()
        var hasActive = false
        for (row in rows) {
            val expires = (row["expires_at"] as? Instant)
                ?: (row["expires_at"] as? Timestamp)?.toInstant()
            val owner = row["owner"]?.toString()
            val reason = row["reason"]?.toString()
            val ticket = row["removal_ticket"]?.toString()
            if (expires == null || owner.isNullOrBlank() || reason.isNullOrBlank() || ticket.isNullOrBlank()) {
                return LoyaltyKillSwitchStatus.CORRUPT
            }
            if (expires.isAfter(now)) {
                hasActive = true
            }
        }
        return if (hasActive) LoyaltyKillSwitchStatus.ACTIVE else LoyaltyKillSwitchStatus.NONE
    }

    private fun readModuleState(): CapabilityState {
        val configs = jdbc.queryForList(
            """SELECT state, config, config_schema_version
               FROM module_configurations
               WHERE module_code='LOYALTY' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'
               FOR SHARE""",
        )
        if (configs.size != 1) return CapabilityState.UNKNOWN
        val config = configs.single()
        val schema = (config["config_schema_version"] as? Number)?.toInt() ?: 0
        val configJson = configJson(config["config"])
        if (schema != 1 || configJson != "{}") return CapabilityState.UNKNOWN
        return CapabilityState.fromWire(config["state"]?.toString())
    }

    private fun configJson(raw: Any?): String {
        val value = raw?.toString() ?: return ""
        val start = value.indexOf('{')
        return if (start >= 0) value.substring(start) else value
    }
}
