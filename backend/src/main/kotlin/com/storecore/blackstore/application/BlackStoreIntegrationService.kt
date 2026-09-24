package com.storecore.blackstore.application

import com.storecore.blackstore.BlackStoreCatalogPage
import com.storecore.blackstore.BlackStoreOperationReceipt
import com.storecore.blackstore.BlackStoreQuadruple
import com.storecore.blackstore.BlackStoreRateLimiter
import com.storecore.blackstore.BlackStoreReconcileResult
import com.storecore.blackstore.BlackStoreReserveLine
import com.storecore.blackstore.BlackStoreSagaException
import com.storecore.blackstore.BlackStoreSagaPolicy
import com.storecore.blackstore.BlackStoreVariantStock
import com.storecore.blackstore.application.dto.BlackStoreReconcileRequest
import com.storecore.blackstore.application.dto.BlackStoreReservationRequest
import com.storecore.blackstore.application.port.BlackStoreCatalogPort
import com.storecore.blackstore.application.port.BlackStoreCompanionGuard
import com.storecore.blackstore.application.port.BlackStoreRateLimitPort
import com.storecore.blackstore.application.port.BlackStoreSagaPort
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class BlackStoreIntegrationService(
    private val capabilities: CapabilityDecisionPort,
    private val companions: BlackStoreCompanionGuard,
    private val limiter: BlackStoreRateLimitPort,
    private val saga: BlackStoreSagaPort,
    private val catalog: BlackStoreCatalogPort,
) {
    fun catalog(
        clientInstanceId: String?,
        cursor: String?,
        pageSize: Int?,
        includeCost: Boolean,
        ifNoneMatch: String? = null,
    ): BlackStoreCatalogPage {
        requireEnabled("CATALOG_READ")
        if (includeCost) requireEnabled("COST_READ")
        val client = parseUuid(clientInstanceId, "X-Client-Instance-Id")
        companions.assertBound(client)
        limiter.check(client.toString(), BlackStoreRateLimiter.Scope.CATALOG)
        val page = catalog.readPage(client, cursor, pageSize ?: BlackStoreSagaPolicy.CATALOG_PAGE_MAX, includeCost)
        if (etagMatches(ifNoneMatch, page.etag)) {
            throw BlackStoreNotModified(page.etag)
        }
        return page
    }

    fun stock(clientInstanceId: String?, variantId: Long): BlackStoreVariantStock {
        requireEnabled("STOCK_READ")
        val client = parseUuid(clientInstanceId, "X-Client-Instance-Id")
        companions.assertBound(client)
        limiter.check(client.toString(), BlackStoreRateLimiter.Scope.STOCK_READ)
        return catalog.readStock(variantId)
    }

    fun reserve(
        clientInstanceId: String?,
        deviceId: String?,
        saleId: String?,
        operationId: String?,
        body: BlackStoreReservationRequest?,
    ): BlackStoreOperationReceipt {
        requireEnabled("STOCK_RESERVE")
        val quadruple = quadruple(clientInstanceId, deviceId, saleId, operationId)
        companions.assertBound(quadruple.clientInstanceId)
        limiter.check(quadruple.clientInstanceId.toString(), BlackStoreRateLimiter.Scope.RESERVE)
        val request = body ?: throw BlackStoreSagaException.validation()
        val catalogVersion = request.catalogVersion?.trim().orEmpty()
        if (catalogVersion.isEmpty()) throw BlackStoreSagaException.validation()
        val defaultPrice = request.priceVersion?.trim().orEmpty()
        val lines = request.lines.orEmpty().map { line ->
            val sku = line.sku?.trim().orEmpty()
            val quantity = line.quantity ?: 0
            val priceVersion = line.priceVersion?.trim().orEmpty().ifEmpty { defaultPrice }
            if (line.variantId == null || sku.isEmpty() || quantity < 1 || priceVersion.isEmpty()) {
                throw BlackStoreSagaException.validation()
            }
            BlackStoreReserveLine(line.variantId, sku, quantity, priceVersion)
        }
        if (lines.isEmpty()) throw BlackStoreSagaException.validation()
        return saga.reserve(quadruple, catalogVersion, lines)
    }

    fun commit(
        clientInstanceId: String?,
        deviceId: String?,
        saleId: String?,
        operationId: String?,
        reservationRef: String,
    ): BlackStoreOperationReceipt {
        requireEnabled("STOCK_COMMIT")
        val quadruple = quadruple(clientInstanceId, deviceId, saleId, operationId)
        companions.assertBound(quadruple.clientInstanceId)
        limiter.check(quadruple.clientInstanceId.toString(), BlackStoreRateLimiter.Scope.RESERVE)
        requireReservationRef(quadruple, reservationRef)
        return saga.commit(quadruple)
    }

    fun release(
        clientInstanceId: String?,
        deviceId: String?,
        saleId: String?,
        operationId: String?,
        reservationRef: String,
    ): BlackStoreOperationReceipt {
        requireEnabled("STOCK_RELEASE")
        val quadruple = quadruple(clientInstanceId, deviceId, saleId, operationId)
        companions.assertBound(quadruple.clientInstanceId)
        limiter.check(quadruple.clientInstanceId.toString(), BlackStoreRateLimiter.Scope.RESERVE)
        requireReservationRef(quadruple, reservationRef)
        return saga.release(quadruple)
    }

    fun operation(
        clientInstanceId: String?,
        deviceId: String?,
        saleId: String?,
        operationIdHeader: String?,
        operationIdPath: String,
    ): BlackStoreOperationReceipt {
        requireEnabled("STOCK_READ")
        val quadruple = quadruple(clientInstanceId, deviceId, saleId, operationIdHeader ?: operationIdPath)
        companions.assertBound(quadruple.clientInstanceId)
        if (quadruple.operationId != parseUuid(operationIdPath, "operationId")) {
            throw BlackStoreSagaException.validation()
        }
        limiter.check(quadruple.clientInstanceId.toString(), BlackStoreRateLimiter.Scope.STOCK_READ)
        return saga.get(quadruple)
    }

    fun reconcile(clientInstanceId: String?, body: BlackStoreReconcileRequest?): BlackStoreReconcileResult {
        requireEnabled("STOCK_READ")
        val client = parseUuid(clientInstanceId, "X-Client-Instance-Id")
        companions.assertBound(client)
        limiter.check(client.toString(), BlackStoreRateLimiter.Scope.RECONCILE)
        return saga.reconcile(body?.knownReceipts.orEmpty())
    }

    fun expireDue(): Int = runWhenEnabled("STOCK_RELEASE") { saga.expireDue() }

    fun purgeDue(): Int = runWhenEnabled("STOCK_READ") { saga.purgeDue() }

    private fun runWhenEnabled(action: String, body: () -> Int): Int =
        try {
            capabilities.decide(JdbcCapabilityService.BLACKSTORE_MODULE, action, CapabilityActor.System)
            body()
        } catch (_: CapabilityDisabled) {
            0
        }

    private fun requireEnabled(action: String) {
        try {
            capabilities.decide(JdbcCapabilityService.BLACKSTORE_MODULE, action, CapabilityActor.System)
        } catch (_: CapabilityDisabled) {
            throw BlackStoreCapabilityDisabled()
        }
    }

    private fun quadruple(
        clientInstanceId: String?,
        deviceId: String?,
        saleId: String?,
        operationId: String?,
    ): BlackStoreQuadruple {
        val device = deviceId?.trim().orEmpty()
        val sale = saleId?.trim().orEmpty()
        if (device.isEmpty() || sale.isEmpty()) throw BlackStoreSagaException.validation()
        return BlackStoreQuadruple(
            parseUuid(clientInstanceId, "X-Client-Instance-Id"),
            device,
            sale,
            parseUuid(operationId, "X-Operation-Id"),
        )
    }

    private fun requireReservationRef(quadruple: BlackStoreQuadruple, reservationRef: String) {
        if (BlackStoreSagaPolicy.reservationRefFor(quadruple) != parseUuid(reservationRef, "reservationRef")) {
            throw BlackStoreSagaException.validation()
        }
    }

    private fun etagMatches(ifNoneMatch: String?, etag: String): Boolean {
        val incoming = normalizeEtag(ifNoneMatch) ?: return false
        return incoming == normalizeEtag(etag)
    }

    private fun normalizeEtag(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        return raw.trim().removePrefix("W/").trim().trim('"')
    }

    private fun parseUuid(raw: String?, name: String): UUID {
        if (raw.isNullOrBlank()) throw BlackStoreSagaException.validation()
        return try {
            UUID.fromString(raw.trim())
        } catch (_: IllegalArgumentException) {
            throw BlackStoreSagaException.validation(name)
        }
    }
}
