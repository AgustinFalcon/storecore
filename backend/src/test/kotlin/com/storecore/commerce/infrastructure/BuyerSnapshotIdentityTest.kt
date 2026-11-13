package com.storecore.commerce.infrastructure

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class BuyerSnapshotIdentityTest {
    @Test
    fun `canonical identity trims boundaries and composes one separator`() {
        val identity = BuyerSnapshotIdentity.fromCanonical("buyer@example.com", " Buyer ", " Name ")
        assertEquals("Buyer Name", identity?.name)
        assertEquals("buyer@example.com", identity?.email)
    }

    @Test
    fun `incomplete canonical identity is rejected`() {
        assertNull(BuyerSnapshotIdentity.fromCanonical(null, "Buyer", "Name"))
        assertNull(BuyerSnapshotIdentity.fromCanonical("buyer@example.com", " ", "Name"))
        assertNull(BuyerSnapshotIdentity.fromCanonical("buyer@example.com", "Buyer", ""))
        assertNull(BuyerSnapshotIdentity.fromCanonical("not-an-email", "Buyer", "Name"))
        assertNull(BuyerSnapshotIdentity.fromCanonical(" Buyer@Example.com ", "Buyer", "Name"))
    }
}
