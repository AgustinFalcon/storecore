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
import com.storecore.configuration.domain.InstallationCapabilityModule
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
        val configJson = configJson(config["config"])
        if (module == BLACKSTORE_MODULE) {
            if (schema != 2 || !blackstoreSchemaV2Valid(configJson)) throw CapabilityConfigInvalid()
        } else if (schema != 1 || configJson != "{}") {
            throw CapabilityConfigInvalid()
        }
        val state = CapabilityState.fromWire(config["state"]?.toString())
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
            CapabilityState.UNKNOWN -> throw CapabilityConfigInvalid()
        }
        when (actor) {
            CapabilityActor.Public -> if (kind != CapabilityActionKind.READ) throw CapabilityActorNotAuthorized()
            CapabilityActor.System -> if (kind == CapabilityActionKind.PUBLISH) throw CapabilityActorNotAuthorized()
            is CapabilityActor.Internal -> {
                if (!actor.principal.hasKnownRole) throw CapabilityActorNotAuthorized()
                if (kind in setOf(CapabilityActionKind.WRITE, CapabilityActionKind.PUBLISH) &&
                    actor.principal.roles.none { it == InternalRole.ADMIN || it == InternalRole.OPERATOR }
                ) throw CapabilityActorNotAuthorized()
            }
        }
    }

    override fun list(): List<CapabilityModuleView> = jdbc.query(
        "SELECT module_code, state, config_version FROM module_configurations ORDER BY module_code",
    ) { rs, _ -> capabilityModuleView(rs.getString("module_code"), rs.getString("state"), rs.getInt("config_version")) }

    @Transactional
    override fun changeState(actor: InternalUserPrincipal, module: String, state: CapabilityState, expectedVersion: Int?, reason: String, correlation: UUID) {
        if (InternalRole.ADMIN !in actor.roles || reason.isBlank()) throw CapabilityActorNotAuthorized()
        if (!state.isKnown || state.wire.contains("FLAG", ignoreCase = true)) throw CapabilityConfigInvalid()
        val expected = expectedVersion ?: jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code=? AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'",
            Int::class.java, module,
        ) ?: throw CapabilityConfigurationMissing()
        val configPayload = if (module == BLACKSTORE_MODULE) {
            jdbc.queryForObject(
                "SELECT config::text FROM module_configurations WHERE module_code=? AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'",
                String::class.java,
                module,
            ) ?: throw CapabilityConfigurationMissing()
        } else {
            "{}"
        }
        try {
            jdbc.query("SELECT capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actor.userId, module, expected, state.wire, configPayload, correlation, reason.trim())
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
    override fun removeKill(actor: InternalUserPrincipal, module: InstallationCapabilityModule, expectedActiveId: Long, reason: String, correlation: UUID) {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        lockActiveKillForModule(module, expectedActiveId)
        try {
            jdbc.query("SELECT capability_admin_remove_kill_switch(?,?,?,?)", { _, _ -> }, actor.userId, expectedActiveId, reason, correlation)
        } catch (exception: Exception) { throw mapAdminError(exception) }
    }

    @Transactional
    override fun replaceKill(actor: InternalUserPrincipal, module: InstallationCapabilityModule, expectedActiveId: Long, owner: String, reason: String, expiresAt: Instant, ticket: String, correlation: UUID): Long {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        lockActiveKillForModule(module, expectedActiveId)
        return try {
            jdbc.queryForObject(
                "SELECT capability_admin_replace_kill_switch(?,?,?,?,?,?,?)",
                Long::class.java, actor.userId, expectedActiveId, owner, reason, java.sql.Timestamp.from(expiresAt), ticket, correlation,
            ) ?: throw CapabilityKillSwitchVersionConflict()
        } catch (exception: Exception) { throw mapAdminError(exception) }
    }

    private fun lockActiveKillForModule(expectedModule: InstallationCapabilityModule, expectedActiveId: Long) {
        if (!expectedModule.visibleOnConsole) throw CapabilityKillSwitchVersionConflict()

        val snapshot = killIdentity(expectedActiveId, lock = false) ?: throw CapabilityKillSwitchVersionConflict()
        requireMatchingKillModule(expectedModule, snapshot.module)

        val actionExists = jdbc.query(
            "SELECT action_code FROM capability_actions WHERE module_code=? AND action_code=? FOR UPDATE",
            { rs, _ -> rs.getString("action_code") },
            snapshot.module.wire,
            snapshot.action,
        ).singleOrNull()
        if (actionExists == null) throw CapabilityKillSwitchVersionConflict()

        val locked = killIdentity(expectedActiveId, lock = true) ?: throw CapabilityKillSwitchVersionConflict()
        requireMatchingKillModule(expectedModule, locked.module)
        if (!locked.active || locked.module != snapshot.module || locked.action != snapshot.action) {
            throw CapabilityKillSwitchVersionConflict()
        }
    }

    private fun killIdentity(id: Long, lock: Boolean): CapabilityKillIdentity? {
        val lockClause = if (lock) " FOR UPDATE" else ""
        return jdbc.query(
            "SELECT module_code, action_code, active FROM capability_kill_switches WHERE id=?$lockClause",
            { rs, _ ->
                CapabilityKillIdentity(
                    module = InstallationCapabilityModule.fromWire(rs.getString("module_code")),
                    action = rs.getString("action_code"),
                    active = rs.getBoolean("active"),
                )
            },
            id,
        ).singleOrNull()
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

    private fun configJson(raw: Any?): String {
        val value = raw?.toString() ?: return ""
        val start = value.indexOf('{')
        return if (start >= 0) value.substring(start) else value
    }

    private fun blackstoreSchemaV2Valid(json: String): Boolean {
        val keys = SCHEMA_V2_KEYS
        val found = keys.filter { json.contains("\"$it\"") }
        return found.size == keys.size && json.contains("\"reservation_ttl_seconds\"")
    }

    companion object {
        const val BLACKSTORE_MODULE = "BLACKSTORE_INTEGRATION"
        private val SCHEMA_V2_KEYS = listOf(
            "catalog_page_size",
            "catalog_rate_limit_rps",
            "cursor_retention_days",
            "expiry_worker_batch_size",
            "expiry_worker_interval_seconds",
            "pending_claim_max_seconds",
            "reconcile_rate_limit_rps",
            "reservation_ttl_max_seconds",
            "reservation_ttl_min_seconds",
            "reservation_ttl_seconds",
            "reserve_burst",
            "reserve_rate_limit_rps",
            "stock_read_rate_limit_rps",
        )
    }
}

private data class CapabilityKillIdentity(
    val module: InstallationCapabilityModule,
    val action: String,
    val active: Boolean,
)

internal fun requireMatchingKillModule(
    expected: InstallationCapabilityModule,
    actual: InstallationCapabilityModule,
) {
    if (!expected.visibleOnConsole || expected != actual) throw CapabilityKillSwitchVersionConflict()
}

internal fun capabilityModuleView(moduleCode: String?, stateWire: String?, configVersion: Int): CapabilityModuleView =
    CapabilityModuleView(
        module = InstallationCapabilityModule.fromWire(moduleCode),
        state = CapabilityState.fromWire(stateWire),
        configVersion = configVersion,
    )
