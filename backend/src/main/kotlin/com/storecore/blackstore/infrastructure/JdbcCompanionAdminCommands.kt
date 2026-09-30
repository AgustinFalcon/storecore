package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.application.CompanionAdminCommandAborted
import com.storecore.blackstore.application.CompanionAdminCommandPort
import com.storecore.blackstore.application.CompanionAdminException
import com.storecore.blackstore.application.CompanionAdminPayloadConflict
import com.storecore.blackstore.application.CompanionAdminPoolMissing
import com.storecore.blackstore.application.CompanionAdminSessionDenied
import com.storecore.blackstore.application.CompanionAdminView
import com.storecore.blackstore.application.CompanionTokenGenerator
import com.storecore.blackstore.application.port.CompanionSecretProvider
import com.storecore.blackstore.application.port.SecretResolveResult
import com.storecore.blackstore.domain.CompanionAdminCommand
import com.storecore.blackstore.domain.CompanionAdminOperation
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcCompanionAdminCommands(
    @Autowired(required = false) private val adminJdbc: CompanionAdminJdbc? = null,
    private val secrets: CompanionSecretProvider,
) : CompanionAdminCommandPort {
    override fun pair(actor: InternalUserPrincipal, command: CompanionAdminCommand.Pair): CompanionAdminView {
        validateSecretCommand(command.scopes, command.reason)
        val admin = admin()
        val hash = command.requestHash()
        return try {
            val prepared = prepare(
                admin,
                actor,
                command.operation.wire,
                command.clientInstanceId,
                null,
                null,
                null,
                command.scopes,
                command.correlation,
                command.reason,
                hash,
            )
            if (prepared in TERMINAL) {
                return statusWithoutBearer(actor, command.correlation, prepared)
            }
            val secret = secrets.prepare(command.correlation.toString(), CompanionTokenGenerator.next256Bits())
            val attached = attach(admin, actor, command.correlation, hash, secret.fingerprint, secret.secretRef)
            if (attached in TERMINAL) {
                return statusWithoutBearer(actor, command.correlation, attached)
            }
            val json = admin.jdbc.queryForObject(
                "SELECT public.companion_admin_pair(?, ?::uuid, ?, ?, ?::text[], ?, ?::uuid, ?, ?::uuid)::text",
                String::class.java,
                actor.userId,
                command.clientInstanceId,
                secret.fingerprint,
                secret.secretRef,
                scopesSql(command.scopes),
                CompanionServiceRole.SERVICE.wire,
                command.correlation,
                command.reason,
                actor.sessionId,
            ) ?: throw CompanionAdminCommandAborted()
            finishSecretCommand(json, secret.secretRef, command.correlation, actor)
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    override fun rotate(actor: InternalUserPrincipal, command: CompanionAdminCommand.Rotate): CompanionAdminView {
        validateSecretCommand(command.scopes, command.reason)
        if (command.expectedState == CompanionLifecycleStatus.Unknown) throw CompanionAdminPayloadConflict()
        val admin = admin()
        val hash = command.requestHash()
        return try {
            val prepared = prepare(
                admin,
                actor,
                command.operation.wire,
                null,
                command.companionId,
                command.expectedState.wire,
                command.expectedCredentialVersion,
                command.scopes,
                command.correlation,
                command.reason,
                hash,
            )
            if (prepared in TERMINAL) {
                return statusWithoutBearer(actor, command.correlation, prepared)
            }
            val secret = secrets.prepare(command.correlation.toString(), CompanionTokenGenerator.next256Bits())
            val attached = attach(admin, actor, command.correlation, hash, secret.fingerprint, secret.secretRef)
            if (attached in TERMINAL) {
                return statusWithoutBearer(actor, command.correlation, attached)
            }
            val json = admin.jdbc.queryForObject(
                "SELECT public.companion_admin_rotate(?, ?, ?, ?, ?, ?, ?::text[], ?, ?::uuid, ?, ?::uuid)::text",
                String::class.java,
                actor.userId,
                command.companionId,
                command.expectedState.wire,
                command.expectedCredentialVersion,
                secret.fingerprint,
                secret.secretRef,
                scopesSql(command.scopes),
                CompanionServiceRole.SERVICE.wire,
                command.correlation,
                command.reason,
                actor.sessionId,
            ) ?: throw CompanionAdminCommandAborted()
            finishSecretCommand(json, secret.secretRef, command.correlation, actor)
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    override fun applyState(actor: InternalUserPrincipal, command: CompanionAdminCommand.ApplyState): CompanionAdminView {
        if (command.reason.isBlank() || command.expectedState == CompanionLifecycleStatus.Unknown) throw CompanionAdminPayloadConflict()
        val sql = when (command.operation) {
            CompanionAdminOperation.Activate -> "SELECT public.companion_admin_activate(?, ?, ?, ?, ?::uuid, ?, ?::uuid)::text"
            CompanionAdminOperation.Suspend -> "SELECT public.companion_admin_suspend(?, ?, ?, ?, ?::uuid, ?, ?::uuid)::text"
            CompanionAdminOperation.Revoke -> "SELECT public.companion_admin_revoke(?, ?, ?, ?, ?::uuid, ?, ?::uuid)::text"
            else -> throw CompanionAdminPayloadConflict()
        }
        val admin = admin()
        return try {
            val json = admin.jdbc.queryForObject(
                sql,
                String::class.java,
                actor.userId,
                command.companionId,
                command.expectedState.wire,
                command.expectedCredentialVersion,
                command.correlation,
                command.reason,
                actor.sessionId,
            ) ?: throw CompanionAdminCommandAborted()
            parseResult(json, bearer = null)
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    override fun commandStatus(actor: InternalUserPrincipal, correlation: UUID): CompanionAdminView {
        val admin = admin()
        return try {
            readStatus(admin, actor, correlation)
        } catch (exception: Exception) {
            throw mapAdminError(exception)
        }
    }

    private fun prepare(
        admin: CompanionAdminJdbc,
        actor: InternalUserPrincipal,
        operation: String,
        client: UUID?,
        companionId: Long?,
        expectedState: String?,
        expectedVersion: Int?,
        scopes: List<CompanionScope>,
        correlation: UUID,
        reason: String,
        hash: String,
    ): String =
        admin.jdbc.queryForObject(
            "SELECT command_state FROM public.companion_admin_prepare_command(?, ?, ?::uuid, ?, ?, ?, ?::text[], ?, ?::uuid, ?, ?, ?::uuid)",
            String::class.java,
            actor.userId,
            operation,
            client,
            companionId,
            expectedState,
            expectedVersion,
            scopesSql(scopes),
            CompanionServiceRole.SERVICE.wire,
            correlation,
            reason,
            hash,
            actor.sessionId,
        ) ?: throw CompanionAdminSessionDenied()

    private fun attach(
        admin: CompanionAdminJdbc,
        actor: InternalUserPrincipal,
        correlation: UUID,
        hash: String,
        fingerprint: String,
        secretRef: String,
    ): String =
        admin.jdbc.queryForObject(
            "SELECT public.companion_admin_attach_secret(?, ?::uuid, ?, ?, ?, ?::uuid)",
            String::class.java,
            actor.userId,
            correlation,
            hash,
            fingerprint,
            secretRef,
            actor.sessionId,
        ) ?: throw CompanionAdminSessionDenied()

    private fun finishSecretCommand(
        json: String,
        secretRef: String,
        correlation: UUID,
        actor: InternalUserPrincipal,
    ): CompanionAdminView {
        if (aborted(json)) {
            secrets.discard(secretRef, correlation.toString())
            throw CompanionAdminCommandAborted()
        }
        val bearer = when (val resolved = secrets.resolve(secretRef)) {
            is SecretResolveResult.SecretBytes -> CompanionTokenGenerator.toHex(resolved.bytes)
            else -> null
        }
        return parseResult(json, bearer)
    }

    private fun statusWithoutBearer(actor: InternalUserPrincipal, correlation: UUID, commandState: String): CompanionAdminView {
        val current = commandStatus(actor, correlation)
        return current.copy(commandState = commandState, bearer = null)
    }

    private fun readStatus(admin: CompanionAdminJdbc, actor: InternalUserPrincipal, correlation: UUID): CompanionAdminView {
        val rows = admin.jdbc.query(
            "SELECT command_state, operation_kind, companion_id, credential_version FROM public.companion_admin_command_status(?, ?::uuid, ?::uuid)",
            { rs, _ ->
                CompanionAdminView(
                    companionId = rs.getObject("companion_id") as? Long ?: rs.getLong("companion_id").takeIf { !rs.wasNull() },
                    status = null,
                    credentialVersion = rs.getObject("credential_version") as? Int ?: rs.getInt("credential_version").takeIf { !rs.wasNull() },
                    commandState = rs.getString("command_state"),
                    operation = rs.getString("operation_kind"),
                    bearer = null,
                )
            },
            actor.userId,
            correlation,
            actor.sessionId,
        )
        return rows.singleOrNull() ?: throw CompanionAdminSessionDenied()
    }

    private fun parseResult(json: String, bearer: String?): CompanionAdminView {
        if (aborted(json)) throw CompanionAdminCommandAborted()
        val companionId = Regex("\"companionId\"\\s*:\\s*(\\d+)").find(json)?.groupValues?.get(1)?.toLong()
        val version = Regex("\"credentialVersion\"\\s*:\\s*(\\d+)").find(json)?.groupValues?.get(1)?.toInt()
        val statusWire = Regex("\"status\"\\s*:\\s*\"([A-Z_]+)\"").find(json)?.groupValues?.get(1)
        return CompanionAdminView(
            companionId = companionId,
            status = statusWire?.let { CompanionLifecycleStatus.fromWire(it) },
            credentialVersion = version,
            commandState = "COMPLETED",
            operation = null,
            bearer = bearer,
        )
    }

    private fun validateSecretCommand(scopes: List<CompanionScope>, reason: String) {
        if (reason.isBlank() || scopes.isEmpty() || scopes.any { it == CompanionScope.Unknown }) {
            throw CompanionAdminPayloadConflict()
        }
    }

    private fun admin(): CompanionAdminJdbc = adminJdbc ?: throw CompanionAdminPoolMissing()

    private fun scopesSql(scopes: List<CompanionScope>): String = "{" + scopes.map { it.wire }.sorted().joinToString(",") + "}"

    private fun aborted(json: String): Boolean = json.contains("ABORTED") && json.contains("status")

    private fun mapAdminError(exception: Exception): RuntimeException {
        if (exception is CompanionAdminException) return exception
        val text = generateSequence(exception as Throwable) { it.cause }.mapNotNull { it.message }.joinToString(" ")
        return when {
            text.contains("CAPABILITY_PAYLOAD_CONFLICT") || text.contains("COMPANION_ADMIN_PAYLOAD_CONFLICT") -> CompanionAdminPayloadConflict()
            text.contains("CAPABILITY_SESSION_DENIED") || text.contains("COMPANION_ADMIN_SESSION_DENIED") -> CompanionAdminSessionDenied()
            else -> CompanionAdminPayloadConflict()
        }
    }

    companion object {
        private val TERMINAL = setOf("COMPLETED", "ABORTED")
    }
}
