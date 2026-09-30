package com.storecore.blackstore

import com.storecore.blackstore.application.BlackStoreIntegrationException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

internal object BlackStoreSagaPolicy {
    const val CONTRACT_VERSION = "1.0.0-draft"
    const val RESERVATION_SECONDS = 900L
    const val PENDING_CLAIM_SECONDS = 60L
    const val PURGE_AFTER_DAYS = 90L
    const val TOMBSTONE_YEARS = 7L
    const val CATALOG_PAGE_MAX = 200
    const val CATALOG_VALID_DAYS = 7L
    val OPERATION_NAMESPACE: UUID = UUID.fromString("6f1c2a10-9b3e-4d71-9c0a-4c58a7c724b4")

    fun uuidV5(namespace: UUID, name: String): UUID {
        val ns = ByteBuffer.allocate(16)
            .putLong(namespace.mostSignificantBits)
            .putLong(namespace.leastSignificantBits)
            .array()
        val digest = MessageDigest.getInstance("SHA-1")
        digest.update(ns)
        digest.update(name.toByteArray(StandardCharsets.UTF_8))
        val hash = digest.digest()
        hash[6] = ((hash[6].toInt() and 0x0f) or 0x50).toByte()
        hash[8] = ((hash[8].toInt() and 0x3f) or 0x80).toByte()
        val buffer = ByteBuffer.wrap(hash, 0, 16)
        return UUID(buffer.long, buffer.long)
    }

    fun requestHash(catalogVersion: String, lines: List<BlackStoreReserveLine>): String {
        val canonical = buildString {
            append(catalogVersion)
            append('|')
            lines.sortedWith(compareBy({ it.variantId }, { it.sku })).forEach { line ->
                append(line.variantId)
                append(':')
                append(line.sku)
                append(':')
                append(line.quantity)
                append(':')
                append(line.priceVersion)
                append(';')
            }
        }
        return MessageDigest.getInstance("SHA-256")
            .digest(canonical.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
    }

    fun requestHashH2(catalogVersion: String, lines: List<BlackStoreReserveLine>): String {
        val sha = MessageDigest.getInstance("SHA-256")
        sha.update("BS-RESERVE-H2".toByteArray(StandardCharsets.UTF_8))
        sha.update(0)
        fun putString(value: String) {
            val bytes = value.toByteArray(StandardCharsets.UTF_8)
            sha.update(ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(bytes.size).array())
            sha.update(bytes)
        }
        putString(catalogVersion.trim())
        val ordered = lines.sortedBy { it.variantId }
        sha.update(ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(ordered.size).array())
        ordered.forEach { line ->
            sha.update(ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN).putLong(line.variantId).array())
            putString(line.sku.trim())
            sha.update(ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(line.quantity).array())
            putString(line.priceVersion.trim())
        }
        return sha.digest().joinToString("") { "%02x".format(it) }
    }

    fun receiptFor(quadruple: BlackStoreQuadruple): String =
        uuidV5(OPERATION_NAMESPACE, "${quadruple.clientInstanceId}|${quadruple.deviceId}|${quadruple.saleId}|${quadruple.operationId}|receipt").toString()

    fun reservationRefFor(quadruple: BlackStoreQuadruple): UUID =
        uuidV5(OPERATION_NAMESPACE, "${quadruple.clientInstanceId}|${quadruple.deviceId}|${quadruple.saleId}|${quadruple.operationId}|reservation")

    fun inventoryReservationKey(reservationRef: UUID, variantId: Long): UUID =
        uuidV5(OPERATION_NAMESPACE, "res:$reservationRef:$variantId")

    fun ledgerKey(reservationRef: UUID, variantId: Long, eventType: String): UUID =
        uuidV5(OPERATION_NAMESPACE, "led:$reservationRef:$variantId:$eventType")
}

data class BlackStoreQuadruple(
    val clientInstanceId: UUID,
    val deviceId: String,
    val saleId: String,
    val operationId: UUID,
)

data class BlackStoreReserveLine(
    val variantId: Long,
    val sku: String,
    val quantity: Int,
    val priceVersion: String,
)

data class BlackStoreAcceptedPrice(
    val variantId: Long,
    val sku: String,
    val priceVersion: String,
)

data class BlackStoreAvailableAfter(
    val variantId: Long,
    val availableQuantity: Int,
)

data class BlackStoreLineFailure(
    val lineIndex: Int,
    val variantId: Long,
    val sku: String,
    val requested: Int,
    val availableQuantity: Int,
    val code: String,
)

data class BlackStoreOperationReceipt(
    val state: String,
    val contractVersion: String = BlackStoreSagaPolicy.CONTRACT_VERSION,
    val catalogVersion: String?,
    val receipt: String? = null,
    val reservationRef: UUID? = null,
    val expiresAt: Instant? = null,
    val acceptedPriceVersions: List<BlackStoreAcceptedPrice> = emptyList(),
    val availableAfter: List<BlackStoreAvailableAfter> = emptyList(),
)

data class BlackStoreReconcileResult(
    val present: List<BlackStoreOperationReceipt>,
    val unknownReceipts: List<String>,
)

data class BlackStoreCatalogItem(
    val productId: Long,
    val variantId: Long,
    val sku: String,
    val barcode: String?,
    val name: String,
    val images: List<String>,
    val unitPrice: java.math.BigDecimal,
    val priceVersion: String,
    val currency: String,
    val availableQuantity: Int,
    val active: Boolean,
)

data class BlackStoreCatalogPage(
    val catalogVersion: String,
    val generatedAt: Instant,
    val validUntil: Instant,
    val etag: String,
    val nextCursor: String?,
    val items: List<BlackStoreCatalogItem>,
)

data class BlackStoreVariantStock(
    val variantId: Long,
    val sku: String,
    val availableQuantity: Int,
    val catalogVersion: String,
)

class BlackStoreSagaException(
    code: String,
    httpStatus: Int,
    retryable: Boolean = false,
    val lineFailures: List<BlackStoreLineFailure> = emptyList(),
    val retryAfterSeconds: Int? = null,
) : BlackStoreIntegrationException(code, httpStatus, retryable) {
    companion object {
        fun conflict() = BlackStoreSagaException("CONFLICT", 409, retryable = true)
        fun stateConflict() = BlackStoreSagaException("OPERATION_STATE_CONFLICT", 409, retryable = false)
        fun mismatch() = BlackStoreSagaException("IDEMPOTENCY_PAYLOAD_MISMATCH", 409, retryable = false)
        fun retired() = BlackStoreSagaException("OPERATION_RETIRED", 410, retryable = false)
        fun expired() = BlackStoreSagaException("EXPIRED", 409, retryable = false)
        fun insufficient(failures: List<BlackStoreLineFailure>) =
            BlackStoreSagaException("INSUFFICIENT_STOCK", 409, retryable = false, lineFailures = failures)
        fun stale() = BlackStoreSagaException("CATALOG_VERSION_STALE", 422, retryable = false)
        fun notFound() = BlackStoreSagaException("NOT_FOUND", 404, retryable = false)
        fun validation(code: String = "VALIDATION") = BlackStoreSagaException(code, 400, retryable = false)
        fun cursorExpired() = BlackStoreSagaException("CURSOR_EXPIRED", 410, retryable = false)
        fun costForbidden() = BlackStoreSagaException("FORBIDDEN", 403, retryable = false)
        fun rateLimited(retryAfterSeconds: Int = 1) =
            BlackStoreSagaException("RATE_LIMITED", 429, retryable = true, retryAfterSeconds = retryAfterSeconds)
    }
}
