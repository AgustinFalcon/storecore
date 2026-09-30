package com.storecore.commerce.application

import com.storecore.commerce.application.port.ChannelStockOutboxPort
import com.storecore.commerce.application.port.DesiredStockChangedIntent
import com.storecore.commerce.application.port.LockedListingProjection
import com.storecore.commerce.application.port.MarketplaceListingProjectionPort
import com.storecore.commerce.application.port.ProjectionWrite
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.DesiredStockOutcome
import com.storecore.commerce.domain.DesiredStockProjectionResult
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.domain.ProjectionState
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class DesiredStockProjectionUseCase(
    private val capabilities: CapabilityDecisionPort,
    private val listings: MarketplaceListingProjectionPort,
    private val outbox: ChannelStockOutboxPort,
) {
    @Transactional
    fun project(variantIds: Collection<Long>, cause: ProjectionSourceCause, actor: CapabilityActor): List<DesiredStockProjectionResult> {
        if (cause === ProjectionSourceCause.Unknown) throw CommerceValidation("PROJECTION_CAUSE_UNKNOWN")
        val unique = variantIds.distinct().sorted()
        if (unique.isEmpty()) return emptyList()
        capabilities.decide("MARKETPLACE_ML", "SYNC", actor)
        val locked = listings.lockByVariantIds(unique)
        val results = mutableListOf<DesiredStockProjectionResult>()
        val covered = locked.map { it.variantId }.toSet()
        unique.filterNot { it in covered }.forEach { variantId ->
            results += DesiredStockProjectionResult(variantId, null, DesiredStockOutcome.NoListing, null, null)
        }
        locked.sortedBy { it.listingId }.forEach { row ->
            results += upsert(row, cause)
        }
        return results
    }

    private fun upsert(row: LockedListingProjection, cause: ProjectionSourceCause): DesiredStockProjectionResult {
        val sellable = sellable(row.availableQuantity, row.safetyStock)
        val withheldReason = withholdingReason(row)
        val state = if (withheldReason == null) ProjectionState.Emitted else ProjectionState.Withheld
        val mappingFp = fingerprint(listOf(row.accountId.toString(), row.externalListingId, row.variationId.orEmpty(), row.variantId.toString()))
        val eligibilityFp = fingerprint(
            listOf(
                row.accountRevision.toString(),
                row.productRevision.toString(),
                row.variantRevision.toString(),
                row.mappingRevision.toString(),
                row.purpose.wire,
                row.accountState.wire,
                row.listingState.wire,
                row.productStatus.wire,
                row.variantActive.toString(),
                row.manualIntervention.toString(),
            ),
        )
        val same =
            row.currentVersion != null &&
                row.currentVariantId == row.variantId &&
                row.currentQuantity == sellable &&
                row.currentState == state &&
                (row.currentReason ?: "") == (withheldReason ?: "") &&
                row.currentMappingFingerprint == mappingFp &&
                row.currentEligibilityFingerprint == eligibilityFp
        if (same) {
            return DesiredStockProjectionResult(row.variantId, row.listingId, DesiredStockOutcome.Unchanged, row.currentVersion, sellable)
        }
        val nextVersion = (row.currentVersion ?: 0L) + 1L
        val written = listings.write(
            ProjectionWrite(
                listingId = row.listingId,
                accountId = row.accountId,
                variantId = row.variantId,
                externalListingId = row.externalListingId,
                variationId = row.variationId,
                desiredQuantity = sellable,
                expectedVersion = row.currentVersion,
                nextVersion = nextVersion,
                state = state,
                withholdingReason = withheldReason,
                mappingFingerprint = mappingFp,
                eligibilityFingerprint = eligibilityFp,
                sourceCause = cause.wire,
            ),
        )
        if (written != 1) throw CommerceValidation("PROJECTION_VERSION_CONFLICT")
        if (state.isWithheld()) {
            return DesiredStockProjectionResult(row.variantId, row.listingId, DesiredStockOutcome.Withheld, nextVersion, sellable)
        }
        outbox.appendDesiredStockChanged(
            DesiredStockChangedIntent(
                listingId = row.listingId,
                accountId = row.accountId,
                variantId = row.variantId,
                externalListingId = row.externalListingId,
                variationId = row.variationId,
                desiredQuantity = sellable,
                projectionVersion = nextVersion,
                mappingFingerprint = mappingFp,
                eligibilityFingerprint = eligibilityFp,
                sourceCause = cause.wire,
            ),
        )
        return DesiredStockProjectionResult(row.variantId, row.listingId, DesiredStockOutcome.Projected, nextVersion, sellable)
    }

    companion object {
        fun sellable(availableQuantity: Int, safetyStock: Int): Int = maxOf(0, availableQuantity - safetyStock)

        fun withholdingReason(row: LockedListingProjection): String? {
            if (!row.purpose.allowsExternalMlSync()) {
                return if (row.purpose === ChannelAccountPurpose.InternalPricePolicy) "INTERNAL_PRICE_POLICY" else "UPGRADE_CLASSIFICATION_REQUIRED"
            }
            if (!row.accountState.isActive()) return "ACCOUNT_NOT_ACTIVE"
            if (!row.listingState.isActive()) return "LISTING_NOT_ACTIVE"
            if (row.manualIntervention) return "MANUAL_INTERVENTION"
            if (!row.productStatus.isActive()) return "PRODUCT_INACTIVE"
            if (!row.variantActive) return "VARIANT_INACTIVE"
            return null
        }

        fun fingerprint(parts: List<String>): String {
            val joined = parts.joinToString("|")
            return MessageDigest.getInstance("SHA-256").digest(joined.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
        }
    }
}
