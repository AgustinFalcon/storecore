package com.storecore.blackstore

import com.storecore.blackstore.application.CompanionRouteScopeMatrix
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import org.springframework.http.HttpMethod

class CompanionScopeTest {
    @Test
    fun unknownWireDoesNotBecomeAValidScope() {
        assertEquals(CompanionScope.Unknown, CompanionScope.fromWire("admin:*"))
        assertEquals(CompanionScope.CATALOG_READ, CompanionScope.fromWire("catalog:read"))
        assertNotEquals(CompanionScope.CATALOG_READ.wire, CompanionScope.fromWire(" CATALOG:READ ").wire)
        assertEquals(CompanionServiceRole.SERVICE, CompanionServiceRole.fromWire("SERVICE"))
        assertEquals(CompanionServiceRole.Unknown, CompanionServiceRole.fromWire("ADMIN"))
        assertEquals(CompanionScope.CATALOG_READ, CompanionRouteScopeMatrix.required(HttpMethod.GET, "/blackstore-integration/v1/catalog"))
        assertEquals(CompanionScope.STOCK_COMMIT, CompanionRouteScopeMatrix.required(HttpMethod.POST, "/blackstore-integration/v1/reservations/abc/commit"))
        assertEquals(CompanionScope.STOCK_READ, CompanionRouteScopeMatrix.required(HttpMethod.POST, "/blackstore-integration/v1/operations/reconcile"))
    }
}
