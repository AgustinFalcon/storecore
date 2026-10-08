package com.storecore.configuration.domain

import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

sealed class CapabilityAdminCommand {
    abstract val correlation: UUID
    abstract val module: String
    abstract val operation: CapabilityAdminOperation
    abstract val reason: String
    abstract fun requestHash(): String

    protected fun digest(parts: List<String?>): String {
        val canonical = parts.joinToString("\u001f") { it?.trim().orEmpty() }
        val bytes = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    data class ChangeState(
        override val correlation: UUID,
        override val module: String,
        val expectedConfigVersion: Int,
        val nextState: CapabilityState,
        override val reason: String,
    ) : CapabilityAdminCommand() {
        override val operation = CapabilityAdminOperation.ChangeState
        init { require(nextState != CapabilityState.Unknown) { "Unrecognized capability state" } }
        override fun requestHash() = digest(listOf(operation.wire, module, expectedConfigVersion.toString(), nextState.name, reason))
    }

    data class KillCreate(
        override val correlation: UUID,
        override val module: String,
        val action: String,
        val owner: String,
        override val reason: String,
        val expiresAt: Instant,
        val ticket: String,
    ) : CapabilityAdminCommand() {
        override val operation = CapabilityAdminOperation.KillCreate
        override fun requestHash() = digest(listOf(operation.wire, module, action, owner, reason, expiresAt.toString(), ticket))
    }

    data class KillReplace(
        override val correlation: UUID,
        override val module: String,
        val expectedActiveId: Long,
        val owner: String,
        override val reason: String,
        val expiresAt: Instant,
        val ticket: String,
    ) : CapabilityAdminCommand() {
        override val operation = CapabilityAdminOperation.KillReplace
        override fun requestHash() = digest(listOf(operation.wire, module, expectedActiveId.toString(), owner, reason, expiresAt.toString(), ticket))
    }

    data class KillRemove(
        override val correlation: UUID,
        override val module: String,
        val expectedActiveId: Long,
        override val reason: String,
    ) : CapabilityAdminCommand() {
        override val operation = CapabilityAdminOperation.KillRemove
        override fun requestHash() = digest(listOf(operation.wire, module, expectedActiveId.toString(), reason))
    }
}
