package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.application.BlackStoreCapabilityDisabled
import com.storecore.blackstore.application.BlackStoreForbidden
import com.storecore.blackstore.application.port.PosCompanionGuardPort
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.sql.SQLException

@Component
class JdbcPosCompanionGuard(
    private val jdbc: JdbcTemplate,
) : PosCompanionGuardPort {
    override fun authorizeForEffect(principal: VerifiedCompanionPrincipal, action: String) {
        call("SELECT public.pos_companion_effect_guard(?::bigint,?::bigint,?::integer,?)", principal, action)
    }

    override fun authorizeForRead(principal: VerifiedCompanionPrincipal, action: String) {
        call("SELECT public.pos_companion_read_guard(?::bigint,?::bigint,?::integer,?)", principal, action)
    }

    private fun call(sql: String, principal: VerifiedCompanionPrincipal, action: String) {
        try {
            jdbc.query(
                sql,
                { _, _ -> },
                principal.companionId,
                principal.credentialId,
                principal.credentialVersion,
                action,
            )
        } catch (ex: RuntimeException) {
            throw translate(ex)
        }
    }

    private fun translate(ex: Throwable): RuntimeException {
        var current: Throwable? = ex
        while (current != null) {
            val sqlState = (current as? SQLException)?.sqlState
            val message = current.message.orEmpty()
            if (sqlState == "P0001" || message.contains("CAPABILITY_DISABLED")) return BlackStoreCapabilityDisabled()
            if (sqlState == "42501" || message.contains("POS_GUARD_DENIED")) return BlackStoreForbidden()
            if (sqlState == "25000" || message.contains("POS_GUARD_ISOLATION")) return BlackStoreForbidden()
            current = current.cause
        }
        return if (ex is RuntimeException) ex else RuntimeException(ex)
    }
}
