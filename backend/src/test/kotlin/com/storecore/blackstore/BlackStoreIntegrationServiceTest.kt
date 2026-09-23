package com.storecore.blackstore

import com.storecore.blackstore.application.BlackStoreCapabilityDisabled
import com.storecore.blackstore.application.BlackStoreIntegrationService
import com.storecore.blackstore.application.BlackStoreNotModified
import com.storecore.blackstore.application.dto.BlackStoreReconcileRequest
import com.storecore.blackstore.application.dto.BlackStoreReservationLineRequest
import com.storecore.blackstore.application.dto.BlackStoreReservationRequest
import com.storecore.blackstore.application.port.BlackStoreCatalogPort
import com.storecore.blackstore.application.port.BlackStoreCompanionGuard
import com.storecore.blackstore.application.port.BlackStoreRateLimitPort
import com.storecore.blackstore.application.port.BlackStoreSagaPort
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class BlackStoreIntegrationServiceTest {
    private val client = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    private val operation = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    @Test
    fun `disabled capability never calls limiter catalog or saga`() {
        val limiter = RecordingLimiter()
        val catalog = RecordingCatalog()
        val saga = RecordingSaga()
        val service = service(disabled = true, limiter, catalog, saga)
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            service.catalog(client, null, 20, false)
        }
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            service.stock(client, 1)
        }
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            service.reserve(client, "pos-1", "sale-1", operation, reserveBody())
        }
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            service.commit(client, "pos-1", "sale-1", operation, UUID.randomUUID().toString())
        }
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            service.release(client, "pos-1", "sale-1", operation, UUID.randomUUID().toString())
        }
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            service.operation(client, "pos-1", "sale-1", operation, operation)
        }
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            service.reconcile(client, BlackStoreReconcileRequest(listOf("r1")))
        }
        assertEquals(0, service.expireDue())
        assertEquals(0, service.purgeDue())
        assertEquals(0, limiter.checks)
        assertEquals(0, catalog.calls)
        assertEquals(0, saga.calls)
    }

    @Test
    fun `enabled double reaches catalog limiter and saga without flipping the real module`() {
        val limiter = RecordingLimiter()
        val catalog = RecordingCatalog()
        val saga = RecordingSaga()
        val service = service(disabled = false, limiter, catalog, saga)
        val page = service.catalog(client, null, 10, false)
        assertEquals("v1", page.catalogVersion)
        assertEquals(1, limiter.checks)
        assertEquals(1, catalog.calls)
        val reserved = service.reserve(client, "pos-1", "sale-1", operation, reserveBody())
        assertEquals("RESERVED", reserved.state)
        assertEquals(2, limiter.checks)
        assertEquals(1, saga.calls)
        assertEquals(1, service.expireDue())
        assertEquals(2, saga.calls)
        assertEquals("SKU-1", service.stock(client, 9).sku)
        val ref = BlackStoreSagaPolicy.reservationRefFor(
            BlackStoreQuadruple(UUID.fromString(client), "pos-1", "sale-1", UUID.fromString(operation)),
        ).toString()
        assertEquals("COMMITTED", service.commit(client, "pos-1", "sale-1", operation, ref).state)
        assertEquals("RELEASED", service.release(client, "pos-1", "sale-1", operation, ref).state)
        assertEquals("RESERVED", service.operation(client, "pos-1", "sale-1", operation, operation).state)
        assertEquals(listOf("missing"), service.reconcile(client, BlackStoreReconcileRequest(listOf("missing"))).unknownReceipts)
        assertEquals(1, service.purgeDue())
        assertEquals(7, limiter.checks)
        assertThrows(BlackStoreSagaException::class.java) {
            service.commit(client, "pos-1", "sale-1", operation, UUID.randomUUID().toString())
        }
        assertEquals("NOT_MODIFIED", assertThrows(BlackStoreNotModified::class.java) {
            service.catalog(client, null, 10, false, "v1")
        }.message)
    }

    private fun reserveBody() = BlackStoreReservationRequest(
        catalogVersion = "v1",
        priceVersion = "catalog-1",
        lines = listOf(BlackStoreReservationLineRequest(1, "SKU-1", 1, "catalog-1")),
    )

    private fun service(
        disabled: Boolean,
        limiter: RecordingLimiter,
        catalog: RecordingCatalog,
        saga: RecordingSaga,
    ) = BlackStoreIntegrationService(
        capabilities = object : CapabilityDecisionPort {
            override fun decide(module: String, action: String, actor: CapabilityActor) {
                if (actor !is CapabilityActor.System) error("unexpected actor")
                if (disabled) throw CapabilityDisabled()
            }
        },
        companions = object : BlackStoreCompanionGuard {
            override fun assertNoLiveTraffic() = Unit
            override fun assertBound(clientInstanceId: UUID) = Unit
        },
        limiter = limiter,
        saga = saga,
        catalog = catalog,
    )

    private class RecordingLimiter : BlackStoreRateLimitPort {
        var checks = 0
        override fun check(identity: String, scope: BlackStoreRateLimiter.Scope) {
            checks += 1
        }
    }

    private class RecordingCatalog : BlackStoreCatalogPort {
        var calls = 0
        override fun readPage(
            clientInstanceId: UUID,
            cursor: String?,
            pageSize: Int,
            includeCost: Boolean,
        ): BlackStoreCatalogPage {
            calls += 1
            val now = Instant.parse("2026-09-23T12:00:00Z")
            return BlackStoreCatalogPage("v1", now, now, "v1", null, emptyList())
        }

        override fun readStock(variantId: Long): BlackStoreVariantStock {
            calls += 1
            return BlackStoreVariantStock(variantId, "SKU-1", 1, "v1")
        }
    }

    private class RecordingSaga : BlackStoreSagaPort {
        var calls = 0
        override fun reserve(
            quadruple: BlackStoreQuadruple,
            catalogVersion: String,
            lines: List<BlackStoreReserveLine>,
        ): BlackStoreOperationReceipt {
            calls += 1
            return BlackStoreOperationReceipt("RESERVED", catalogVersion = catalogVersion)
        }

        override fun commit(quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt {
            calls += 1
            return BlackStoreOperationReceipt("COMMITTED", catalogVersion = "v1")
        }

        override fun release(quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt {
            calls += 1
            return BlackStoreOperationReceipt("RELEASED", catalogVersion = "v1")
        }

        override fun get(quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt {
            calls += 1
            return BlackStoreOperationReceipt("RESERVED", catalogVersion = "v1")
        }

        override fun reconcile(knownReceipts: List<String>): BlackStoreReconcileResult {
            calls += 1
            return BlackStoreReconcileResult(emptyList(), knownReceipts)
        }

        override fun expireDue(limit: Int): Int {
            calls += 1
            return 1
        }

        override fun purgeDue(limit: Int): Int {
            calls += 1
            return 1
        }
    }
}
