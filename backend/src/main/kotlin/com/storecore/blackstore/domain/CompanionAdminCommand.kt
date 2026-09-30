package com.storecore.blackstore.domain

import java.security.MessageDigest
import java.util.UUID

sealed class CompanionAdminCommand {
    abstract val correlation: UUID
    abstract val operation: CompanionAdminOperation
    abstract val reason: String
    abstract fun requestHash(): String

    protected fun digest(parts: List<String?>): String {
        val canonical = parts.joinToString("\u001f") { it?.trim().orEmpty() }
        val bytes = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    protected fun scopeWire(scopes: List<CompanionScope>): String =
        scopes.map { it.wire }.sorted().joinToString(",")

    data class Pair(
        override val correlation: UUID,
        val clientInstanceId: UUID,
        val scopes: List<CompanionScope>,
        override val reason: String,
    ) : CompanionAdminCommand() {
        override val operation = CompanionAdminOperation.Pair
        override fun requestHash() = digest(
            listOf(operation.wire, clientInstanceId.toString(), "", "", "", scopeWire(scopes), CompanionServiceRole.SERVICE.wire, reason),
        )
    }

    data class Rotate(
        override val correlation: UUID,
        val companionId: Long,
        val expectedState: CompanionLifecycleStatus,
        val expectedCredentialVersion: Int,
        val scopes: List<CompanionScope>,
        override val reason: String,
    ) : CompanionAdminCommand() {
        override val operation = CompanionAdminOperation.Rotate
        override fun requestHash() = digest(
            listOf(
                operation.wire,
                "",
                companionId.toString(),
                expectedState.wire,
                expectedCredentialVersion.toString(),
                scopeWire(scopes),
                CompanionServiceRole.SERVICE.wire,
                reason,
            ),
        )
    }

    data class ApplyState(
        override val correlation: UUID,
        override val operation: CompanionAdminOperation,
        val companionId: Long,
        val expectedState: CompanionLifecycleStatus,
        val expectedCredentialVersion: Int,
        override val reason: String,
    ) : CompanionAdminCommand() {
        override fun requestHash() = digest(
            listOf(operation.wire, "", companionId.toString(), expectedState.wire, expectedCredentialVersion.toString(), "", "", reason),
        )
    }
}
