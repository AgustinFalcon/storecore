package com.storecore.configuration.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.configuration.application.CapabilityActionNotAllowed
import com.storecore.configuration.application.CapabilityActorNotAuthorized
import com.storecore.configuration.application.CapabilityAdminIntentMissing
import com.storecore.configuration.application.CapabilityAdminPayloadConflict
import com.storecore.configuration.application.CapabilityAdminPoolMissing
import com.storecore.configuration.application.CapabilityAdminSessionDenied
import com.storecore.configuration.application.CapabilityAdminCommandPort
import com.storecore.configuration.application.CapabilityAdministrationPort
import com.storecore.configuration.application.CapabilityCommandAborted
import com.storecore.configuration.application.CapabilityException
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
import com.storecore.configuration.domain.CapabilityAdminCommand
import com.storecore.configuration.domain.CapabilityAdminOperation
import com.storecore.configuration.domain.CapabilityModuleView
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcCapabilityService(
    private val jdbc: JdbcTemplate,
    @Autowired(required = false) private val adminJdbc: CapabilityAdminJdbc? = null,
) : CapabilityDecisionPort, CapabilityAdministrationPort, CapabilityAdminCommandPort {
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    override fun decide(module: String, action: String, actor: CapabilityActor) {
        if (module == MARKETPLACE_ML_MODULE && action == MARKETPLACE_ML_SYNC) {
            decideMarketplaceMlSync(actor)
            return
        }
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

    private fun decideMarketplaceMlSync(actor: CapabilityActor) {
        val raw = try {
            jdbc.queryForObject("SELECT public.marketplace_ml_sync_snapshot()::text", String::class.java)
        } catch (exception: Exception) {
            throw mapSnapshotError(exception)
        } ?: throw CapabilityActionNotAllowed()
        val photo = ObjectMapper().readTree(raw)
        val kills = photo.path("switches").map { switch ->
            mapOf(
                "id" to switch.path("id").asLong(),
                "expires_at" to switch.path("expiresAt").asText(),
                "owner" to switch.path("owner").asText(),
                "reason" to switch.path("reason").asText(),
                "active" to switch.path("active").asBoolean(),
            )
        }
        val live = kills.filter { kill ->
            val expires = runCatching { Instant.parse(kill["expires_at"].toString()) }.getOrNull()
                ?: runCatching { java.sql.Timestamp.valueOf(kill["expires_at"].toString().replace('T', ' ').take(19)) }.getOrNull()?.toInstant()
            expires != null && expires.isAfter(Instant.now()) &&
                kill["owner"]?.toString()?.isNotBlank() == true &&
                kill["reason"]?.toString()?.isNotBlank() == true &&
                kill["active"] == true
        }
        if (live.size > 1) throw CapabilityKillSwitchInvalid()
        if (live.isNotEmpty()) throw CapabilityKillSwitchActive()
        val state = CapabilityState.valueOf(photo.path("state").asText())
        val kind = CapabilityActionKind.valueOf(photo.path("actionKind").asText())
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

    private fun mapSnapshotError(exception: Exception): RuntimeException {
        val text = generateSequence(exception as Throwable) { it.cause }.mapNotNull { it.message }.joinToString(" ")
        return if (text.contains("ML_SYNC_GUARD_DENIED")) CapabilityActionNotAllowed() else CapabilityActionNotAllowed()
    }

    override fun list(): List<CapabilityModuleView> = jdbc.query(
        "SELECT module_code, state, config_version FROM module_configurations ORDER BY module_code",
    ) { rs, _ -> CapabilityModuleView(rs.getString("module_code"), CapabilityState.valueOf(rs.getString("state")), rs.getInt("config_version")) }

    override fun changeState(actor: InternalUserPrincipal, module: String, state: CapabilityState, expectedVersion: Int?, reason: String, correlation: UUID) {
        if (InternalRole.ADMIN !in actor.roles || reason.isBlank()) throw CapabilityActorNotAuthorized()
        if (state.name.contains("FLAG", ignoreCase = true)) throw CapabilityConfigInvalid()
        val expected = expectedVersion ?: jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code=? AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'",
            Int::class.java, module,
        ) ?: throw CapabilityConfigurationMissing()
        val command = CapabilityAdminCommand.ChangeState(correlation, module, expected, state, reason.trim())
        admit(actor, command)
        commit(actor, command)
    }

    override fun createKill(actor: InternalUserPrincipal, module: String, action: String, owner: String, reason: String, expiresAt: Instant, ticket: String, correlation: UUID): Long {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        val command = CapabilityAdminCommand.KillCreate(correlation, module, action, owner, reason, expiresAt, ticket)
        admit(actor, command)
        return killId(commit(actor, command))
    }

    override fun removeKill(actor: InternalUserPrincipal, expectedActiveId: Long, reason: String, correlation: UUID) {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        val module = jdbc.queryForObject(
            "SELECT module_code FROM capability_kill_switches WHERE id=?",
            String::class.java,
            expectedActiveId,
        ) ?: throw CapabilityKillSwitchVersionConflict()
        val command = CapabilityAdminCommand.KillRemove(correlation, module, expectedActiveId, reason)
        admit(actor, command)
        commit(actor, command)
    }

    override fun replaceKill(actor: InternalUserPrincipal, expectedActiveId: Long, owner: String, reason: String, expiresAt: Instant, ticket: String, correlation: UUID): Long {
        if (InternalRole.ADMIN !in actor.roles) throw CapabilityActorNotAuthorized()
        val module = jdbc.queryForObject(
            "SELECT module_code FROM capability_kill_switches WHERE id=?",
            String::class.java,
            expectedActiveId,
        ) ?: throw CapabilityKillSwitchVersionConflict()
        val command = CapabilityAdminCommand.KillReplace(correlation, module, expectedActiveId, owner, reason, expiresAt, ticket)
        admit(actor, command)
        return killId(commit(actor, command))
    }

    override fun admit(actor: InternalUserPrincipal, command: CapabilityAdminCommand) {
        if (command.operation is CapabilityAdminOperation.Unknown) throw CapabilityConfigInvalid()
        val hash = command.requestHash()
        val existing = jdbc.queryForList(
            """SELECT actor_user_id, session_id, module_code, operation_code, request_hash
               FROM capability_admin_intents WHERE correlation_id=?""",
            command.correlation,
        )
        if (existing.isNotEmpty()) {
            val row = existing.single()
            val same = (row["actor_user_id"] as Number).toLong() == actor.userId &&
                row["session_id"].toString() == actor.sessionId.toString() &&
                row["module_code"] == command.module &&
                row["operation_code"] == command.operation.wire &&
                row["request_hash"] == hash
            if (!same) throw CapabilityAdminPayloadConflict()
            return
        }
        when (command) {
            is CapabilityAdminCommand.ChangeState -> jdbc.update(
                """INSERT INTO capability_admin_intents(
                     correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
                     expected_config_version, next_state, reason)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                command.correlation, actor.userId, actor.sessionId, command.module, command.operation.wire, hash,
                command.expectedConfigVersion, command.nextState.name, command.reason,
            )
            is CapabilityAdminCommand.KillCreate -> jdbc.update(
                """INSERT INTO capability_admin_intents(
                     correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
                     action_code, kill_owner, reason, expires_at, removal_ticket)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                command.correlation, actor.userId, actor.sessionId, command.module, command.operation.wire, hash,
                command.action, command.owner, command.reason, Timestamp.from(command.expiresAt), command.ticket,
            )
            is CapabilityAdminCommand.KillReplace -> jdbc.update(
                """INSERT INTO capability_admin_intents(
                     correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
                     kill_owner, reason, expires_at, removal_ticket, expected_active_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                command.correlation, actor.userId, actor.sessionId, command.module, command.operation.wire, hash,
                command.owner, command.reason, Timestamp.from(command.expiresAt), command.ticket, command.expectedActiveId,
            )
            is CapabilityAdminCommand.KillRemove -> jdbc.update(
                """INSERT INTO capability_admin_intents(
                     correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
                     reason, expected_active_id)
                   VALUES (?,?,?,?,?,?,?,?)""",
                command.correlation, actor.userId, actor.sessionId, command.module, command.operation.wire, hash,
                command.reason, command.expectedActiveId,
            )
        }
    }

    override fun commit(actor: InternalUserPrincipal, command: CapabilityAdminCommand): String {
        val admin = adminJdbc ?: throw CapabilityAdminPoolMissing()
        return try {
            val json = admin.jdbc.queryForObject(
                "SELECT capability_tx_c_execute(?::uuid, ?, ?::uuid, ?)::text",
                String::class.java,
                command.correlation, actor.userId, actor.sessionId, command.module,
            ) ?: throw CapabilityAdminIntentMissing()
            interpret(command, json)
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    override fun commandStatus(actor: InternalUserPrincipal, correlation: UUID): String? {
        val admin = adminJdbc ?: throw CapabilityAdminPoolMissing()
        return try {
            admin.jdbc.queryForObject(
                "SELECT capability_tx_c_status(?::uuid, ?, ?::uuid)::text",
                String::class.java,
                correlation, actor.userId, actor.sessionId,
            )
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    override fun abortCommand(actor: InternalUserPrincipal, correlation: UUID): String {
        val admin = adminJdbc ?: throw CapabilityAdminPoolMissing()
        return try {
            admin.jdbc.queryForObject(
                "SELECT capability_tx_c_abort(?::uuid, ?, ?::uuid)::text",
                String::class.java,
                correlation, actor.userId, actor.sessionId,
            ) ?: throw CapabilityCommandAborted()
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    private fun interpret(command: CapabilityAdminCommand, json: String): String {
        if (json.contains("ABORTED") && json.contains("status")) {
            if (command is CapabilityAdminCommand.ChangeState) {
                val current = jdbc.queryForObject(
                    "SELECT config_version FROM module_configurations WHERE module_code=? AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'",
                    Int::class.java,
                    command.module,
                )
                if (current != null && current != command.expectedConfigVersion) throw CapabilityConfigVersionConflict()
                if (command.module == BLACKSTORE_MODULE) throw CapabilityConfigInvalid()
            }
            if (command is CapabilityAdminCommand.KillCreate || command is CapabilityAdminCommand.KillReplace || command is CapabilityAdminCommand.KillRemove) {
                throw CapabilityKillSwitchVersionConflict()
            }
            throw CapabilityCommandAborted()
        }
        return json
    }

    private fun killId(json: String): Long {
        val match = Regex("\"killSwitchId\"\\s*:\\s*(\\d+)").find(json) ?: throw CapabilityCommandAborted()
        return match.groupValues[1].toLong()
    }

    private fun mapAdminError(exception: Exception): RuntimeException {
        if (exception is CapabilityException) return exception
        val text = generateSequence(exception as Throwable) { it.cause }.mapNotNull { it.message }.joinToString(" ")
        return when {
            text.contains("CAPABILITY_CONFIG_VERSION_CONFLICT") -> CapabilityConfigVersionConflict()
            text.contains("CAPABILITY_ACTOR_NOT_AUTHORIZED") -> CapabilityActorNotAuthorized()
            text.contains("CAPABILITY_KILL_SWITCH_VERSION_CONFLICT") -> CapabilityKillSwitchVersionConflict()
            text.contains("CAPABILITY_PAYLOAD_CONFLICT") -> CapabilityAdminPayloadConflict()
            text.contains("CAPABILITY_SESSION_DENIED") -> CapabilityAdminSessionDenied()
            text.contains("CAPABILITY_INTENT_MISSING") -> CapabilityAdminIntentMissing()
            text.contains("unsupported capability configuration schema") || text.contains("secret") || text.contains("flag") || text.contains("future optional") -> CapabilityConfigInvalid()
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
        const val MARKETPLACE_ML_MODULE = "MARKETPLACE_ML"
        const val MARKETPLACE_ML_SYNC = "SYNC"
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
