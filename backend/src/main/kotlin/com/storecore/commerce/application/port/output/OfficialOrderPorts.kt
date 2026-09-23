package com.storecore.commerce.application.port.output

import com.storecore.commerce.domain.CreationObservation
import com.storecore.commerce.domain.OfficialOrderResource
import com.storecore.commerce.domain.RemoteOrderCandidate
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

interface OfficialOrderQueryPort {
    fun configured(): Boolean
    fun getByProviderOrderId(providerOrderId: String): OfficialOrderResource?
}

interface OfficialOrderCommandPort {
    fun configured(): Boolean
    fun create(request: OfficialOrderCreateRequest): CreationObservation
    fun search(query: OfficialOrderSearchQuery): OfficialOrderSearchResult
}

data class OfficialOrderCreateRequest(
    val idempotencyKey: UUID,
    val externalReference: String,
    val amount: BigDecimal,
    val currency: String,
    val requestHash: String,
)

data class OfficialOrderSearchQuery(
    val externalReference: String,
    val beginDate: Instant,
    val endDate: Instant,
    val page: Int,
    val limit: Int,
)

data class OfficialOrderSearchResult(
    val candidates: List<RemoteOrderCandidate>,
    val pagesFetched: Int,
    val pagesExhausted: Boolean,
)
