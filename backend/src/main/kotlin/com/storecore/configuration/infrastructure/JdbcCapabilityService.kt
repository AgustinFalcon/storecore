package com.storecore.configuration.infrastructure

import com.storecore.configuration.application.CapabilityActionNotAllowed
import com.storecore.configuration.application.CapabilityActorNotAuthorized
import com.storecore.configuration.application.CapabilityAdministrationPort
import com.storecore.configuration.application.CapabilityConfigInvalid
import com.storecore.configuration.application.CapabilityConfigVersionConflict
import com.storecore.configuration.application.CapabilityConfigurationMissing
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.application.CapabilityErrorState
import com.storecore.configuration.application.CapabilityKillSwitchActive
import com.storecore.configuration.application.CapabilityKillSwitchInvalid
import com.storecore.configuration.application.CapabilityKillSwitchVersionConflict
import com.storecore.configuration.application.CapabilityPaused
import com.storecore.configuration.application.CapabilityReadOnly
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityActionKind
import com.storecore.configuration.domain.CapabilityModuleView
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcCapabilityService(private val jdbc: JdbcTemplate) : CapabilityDecisionPort, CapabilityAdministrationPort {
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    override fun decide(module: String, action: String, actor: CapabilityActor) {
        val kills = jdbc.queryForList(
            """SELECT id, expires_at, owner, reason FROM capability_kill_switches
               WHERE module_code=? AND action_code=? AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' AND active
               FOR SHARE""",
            module, action,
        )
        val live = kills.filter { kill ->
            val expires = kill["expires_at"] as? Instant ?: (kill["expires_at"] as? java.sql.Timestamp)?.toInstant()
            expires != null && expires.isAfter(Instant.now()) &&
                !kill["owner"]?.toString().isNullOrBlank() &&
                !kill["reason"]?.toString().isNullOrBlank()
        }
        if (live.size > 1) throw CapabilityKillSwitchInvalid()
        if (live.isNotEmpty()) throw CapabilityKillSwitchActive()
        val configs = jdbc.queryForList(
            """SELECT state, config, config_schema_version FROM module_configurations
               WHERE module_code=? AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR SHARE""",
            module,
        )
        if (configs.size != 1) throw CapabilityConfigurationMissing()
        val config = configs.single()
        val schema = (config["config_schema_version"] as? Number)?.toInt() ?: 0
        if (schema != 1 || config["config"]?.toString() != "{}") throw CapabilityConfigInvalid()
        val state = CapabilityState.valueOf(config["state"].toString())
        val actionRow = jdbc.queryForList(
            "SELECT action_kind, allows_write, allowed_when_paused FROM capability_actions WHERE module_code=? AND action_code=? FOR SHARE",
            module, action,
        ).singleOrNull() ?: throw CapabilityActionNotAllowed()
        val kind = CapabilityActionKind.valueOf(actionRow["action_kind"].toString())
        when (state) {
            CapabilityState.DISABLED -> throw CapabilityDisabled()
            CapabilityState.READ_ONLY -> if (kind !in setOf(CapabilityActionKind.READ, CapabilityActionKind.STATUS, CapabilityActionKind.HEALTH)) throw CapabilityReadOnly()
            CapabilityState.PAUSED -> if (kind !in setOf(CapabilityActionKind.STATUS, CapabilityActionKind.HEALTH)) throw CapabilityPaused()
            CapabilityState.ERROR -> if (kind !in setOf(CapabilityActionKind.STATUS, CapabilityActionKind.HEALTH)) throw CapabilityErrorState()
            CapabilityState.ACTIVE -> Unit
        }
        when (actor) {
            CapabilityActor.Public -> if (kind != CapabilityActionKind.READ) throw CapabilityActorNotAuthorized()
            CapabilityActor.System -> if (kind == CapabilityActionKind.PUBLISH) throw CapabilityActorNotAuthorized()
            is CapabilityActor.Internal -> {
                if (actor.principal.roles.isEmpty()) throw CapabilityActorNotAuthorized()
                if (kind in setOf(CapabilityActionKind.WRITE, CapabilityActionKind.PUBLISH) &&
                    actor.principal.roles.none { it == InternalRole.ADMIN || it == InternalRole.OPERATOR }
                ) throw CapabilityActorNotAuthorized()
            }
        }
    }

    override fun list(): List<CapabilityModuleView> = jdbc.query(
        "SELECT module_code, state, config_version FROM module_configurations ORDER BY module_code",
    ) { rs, _ -> CapabilityModuleView(rs.getString("module_code"), CapabilityState.valueOf(rs.getString("state")), rs.getInt("config_version")) }

    @Transactional
    override fun changeState(actor: InternalUserPrincipal, module: String, state: CapabilityState, expectedVersion: Int?, reason: String, correlation: UUID) {
        if (InternalRole.ADMIN !in actor.roles || reason.isBlank()) throw CapabilityActorNotAuthorized()
        if (state.name.contains("FLAG", ignoreCase = true)) throw CapabilityConfigInvalid()
        val expected = expectedVersion ?: jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code=? AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'",
            Int::class.java, module,
        ) ?: throw CapabilityConfigurationMissing()
        try {
            jdbc.query("SELECT capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actor.userId, module, expected, state.name, "{}", correlation, reason.trim())
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    @Transactional
    override fun createKill(actor: InternalUserPrincipal, module: String, action: String, owner: String, reason: String, expiresAt: Instant, ticket: String, correlation: UUID): Long {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        return try {
            jdbc.queryForObject(
                "SELECT capability_admin_create_kill_switch(?,?,?,?,?,?,?,?)",
                Long::class.java, actor.userId, module, action, owner, reason, java.sql.Timestamp.from(expiresAt), ticket, correlation,
            ) ?: throw CapabilityActorNotAuthorized()
        } catch (exception: Exception) { throw mapAdminError(exception) }
    }

    @Transactional
    override fun removeKill(actor: InternalUserPrincipal, expectedActiveId: Long, reason: String, correlation: UUID) {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        try {
            jdbc.query("SELECT capability_admin_remove_kill_switch(?,?,?,?)", { _, _ -> }, actor.userId, expectedActiveId, reason, correlation)
        } catch (exception: Exception) { throw mapAdminError(exception) }
    }

    @Transactional
    override fun replaceKill(actor: InternalUserPrincipal, expectedActiveId: Long, owner: String, reason: String, expiresAt: Instant, ticket: String, correlation: UUID): Long {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        return try {
            jdbc.queryForObject(
                "SELECT capability_admin_replace_kill_switch(?,?,?,?,?,?,?)",
                Long::class.java, actor.userId, expectedActiveId, owner, reason, java.sql.Timestamp.from(expiresAt), ticket, correlation,
            ) ?: throw CapabilityKillSwitchVersionConflict()
        } catch (exception: Exception) { throw mapAdminError(exception) }
    }

    private fun mapAdminError(exception: Exception): RuntimeException {
        val text = generateSequence(exception as Throwable) { it.cause }.mapNotNull { it.message }.joinToString(" ")
        return when {
            text.contains("CAPABILITY_CONFIG_VERSION_CONFLICT") -> CapabilityConfigVersionConflict()
            text.contains("CAPABILITY_ACTOR_NOT_AUTHORIZED") -> CapabilityActorNotAuthorized()
            text.contains("CAPABILITY_KILL_SWITCH_VERSION_CONFLICT") -> CapabilityKillSwitchVersionConflict()
            text.contains("unsupported capability configuration schema") || text.contains("secret") || text.contains("flag") -> CapabilityConfigInvalid()
            else -> CapabilityConfigInvalid()
        }
    }
}
