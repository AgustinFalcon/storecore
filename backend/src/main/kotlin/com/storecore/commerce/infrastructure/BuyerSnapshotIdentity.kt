package com.storecore.commerce.infrastructure

import com.storecore.identity.domain.CanonicalEmail

/** Canonical customer identity captured once as immutable order evidence. */
internal data class BuyerSnapshotIdentity private constructor(
    val name: String,
    val email: String,
) {
    companion object {
        fun fromCanonical(email: String?, firstName: String?, lastName: String?): BuyerSnapshotIdentity? {
            val rawEmail = email ?: return null
            val canonicalEmail = CanonicalEmail.fromWire(rawEmail)?.takeIf { it.value == rawEmail } ?: return null
            val first = firstName?.trim()?.takeIf(String::isNotEmpty) ?: return null
            val last = lastName?.trim()?.takeIf(String::isNotEmpty) ?: return null
            return BuyerSnapshotIdentity(name = "$first $last", email = canonicalEmail.value)
        }
    }
}
