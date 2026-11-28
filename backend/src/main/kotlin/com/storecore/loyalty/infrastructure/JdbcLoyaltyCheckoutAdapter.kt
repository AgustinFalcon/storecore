package com.storecore.loyalty.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.loyalty.application.LoyaltyActionAdmissionPort
import com.storecore.loyalty.application.LoyaltyCheckoutConflict
import com.storecore.loyalty.application.LoyaltyCheckoutPort
import com.storecore.loyalty.application.LoyaltyEligibilityContext
import com.storecore.loyalty.application.LoyaltyEligibilityPort
import com.storecore.loyalty.application.LoyaltyEvidenceIneligible
import com.storecore.loyalty.application.LoyaltyProfileHead
import com.storecore.loyalty.application.LoyaltyReservationNotFound
import com.storecore.loyalty.application.PreparedLoyaltyBind
import com.storecore.loyalty.domain.CartFingerprint
import com.storecore.loyalty.domain.LoyaltyAction
import com.storecore.loyalty.domain.LoyaltyCartLine
import com.storecore.loyalty.domain.LoyaltyCheckoutSelection
import com.storecore.loyalty.domain.LoyaltyDiscountState
import com.storecore.loyalty.domain.LoyaltyEarningCandidate
import com.storecore.loyalty.domain.LoyaltyEarningEvidence
import com.storecore.loyalty.domain.LoyaltyEarningEvidenceStep
import com.storecore.loyalty.domain.LoyaltyEvidenceAdmission
import com.storecore.loyalty.domain.LoyaltyEvidenceAdmissionStep
import com.storecore.loyalty.domain.LoyaltyEvidenceCurrency
import com.storecore.loyalty.domain.LoyaltyEvidenceKind
import com.storecore.loyalty.domain.LoyaltyEvidencePurpose
import com.storecore.loyalty.domain.LoyaltyEvidenceRevision
import com.storecore.loyalty.domain.LoyaltyEvidenceUnavailableReason
import com.storecore.loyalty.domain.LoyaltyFinalEvidence
import com.storecore.loyalty.domain.LoyaltyFinalEvidenceStep
import com.storecore.loyalty.domain.LoyaltyFingerprint
import com.storecore.loyalty.domain.LoyaltyFrozenLine
import com.storecore.loyalty.domain.LoyaltyItemClassification
import com.storecore.loyalty.domain.LoyaltyMinorUnits
import com.storecore.loyalty.domain.LoyaltyOrderItemCorrelation
import com.storecore.loyalty.domain.LoyaltyPoints
import com.storecore.loyalty.domain.LoyaltyPriceProfile
import com.storecore.loyalty.domain.LoyaltyQuoteEvidenceStep
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.sql.ResultSet
import java.sql.Timestamp
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcLoyaltyCheckoutAdapter(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    private val actionAdmission: LoyaltyActionAdmissionPort,
) : LoyaltyEligibilityPort, LoyaltyCheckoutPort {

    override fun admitBind(customer: CustomerPrincipal) {
        actionAdmission.requireAdmitted(LoyaltyAction.BIND_CHECKOUT, CapabilityActor.Customer(customer))
    }

    override fun assertLiveCustomerSession(customer: CustomerPrincipal) {
        try {
            jdbc.queryForObject("SELECT loyalty_checkout_assert_live_customer_session(?, ?)", Object::class.java, customer.customerId, customer.sessionId)
        } catch (ex: DataAccessException) {
            val detail = rootMessage(ex)
            if (detail.contains("LOYALTY_ACTOR_NOT_AUTHORIZED")) throw AuthenticationFailed()
            throw ex
        }
    }

    /**
     * Reads latest profile heads under already-held product/variant locks in ascending variant order.
     */
    override fun resolveCheckoutEligibility(
        cartLines: List<LoyaltyCartLine>,
        selection: LoyaltyCheckoutSelection,
    ): LoyaltyEligibilityContext {
        val zeroRevision = requireNotNull(LoyaltyEvidenceRevision.fromWire("0"))
        val profiles = linkedMapOf<Long, LoyaltyProfileHead>()
        for (variantId in cartLines.map { it.variantId }.distinct().sorted()) {
            val maxRev = jdbc.queryForObject(
                "SELECT coalesce(max(revision), 0) FROM catalog_loyalty_price_profiles WHERE variant_id=?",
                Long::class.java,
                variantId,
            ) ?: 0L
            val latestRev = LoyaltyEvidenceRevision.fromWire(maxRev.toString()) ?: zeroRevision
            val profile = if (maxRev > 0L) {
                jdbc.query(
                    """SELECT id, variant_id, revision, currency, gross_unit_minor, merchandise_unit_minor,
                              excluded_tax_unit_minor, classification, evidence_kind, source_reference,
                              admin_command_id, recorded_at
                       FROM catalog_loyalty_price_profiles
                       WHERE variant_id=? AND revision=?
                       FOR SHARE""",
                    { rs, _ -> mapProfile(rs) },
                    variantId, maxRev,
                ).singleOrNull()
            } else null
            profiles[variantId] = LoyaltyProfileHead(profile, latestRev)
        }
        if (selection !is LoyaltyCheckoutSelection.Reservation) {
            return LoyaltyEligibilityContext(profiles, null, null)
        }
        val frozen = mutableListOf<LoyaltyFrozenLine>()
        for (line in cartLines.sortedBy { it.cartItemId }) {
            val head = profiles.getValue(line.variantId)
            when (val admitted = LoyaltyEvidenceAdmissionStep.admit(line, head.profile, head.latestRevision, LoyaltyEvidencePurpose.REDEMPTION)) {
                is LoyaltyEvidenceAdmission.Available -> frozen += admitted.snapshot
                is LoyaltyEvidenceAdmission.Unavailable ->
                    return LoyaltyEligibilityContext(profiles, null, admitted.reason)
            }
        }
        return LoyaltyEligibilityContext(profiles, frozen, null)
    }

    override fun prepareRedemptionBind(
        customer: CustomerPrincipal,
        selection: LoyaltyCheckoutSelection.Reservation,
        cartFingerprint: CartFingerprint,
        eligibility: LoyaltyEligibilityContext,
    ): PreparedLoyaltyBind {
        val currentFrozen = eligibility.redemptionFrozenLines
            ?: throw LoyaltyEvidenceIneligible(eligibility.redemptionUnavailableReason ?: LoyaltyEvidenceUnavailableReason.UNKNOWN)

        val boundAt = try {
            jdbc.queryForObject(
                "SELECT loyalty_prepare_checkout_bind(?, ?, ?, ?, ?)",
                Timestamp::class.java,
                customer.customerId,
                customer.sessionId,
                selection.reservationId,
                selection.expectedReservationRevision.value,
                cartFingerprint.value,
            )!!.toInstant()
        } catch (ex: DataAccessException) {
            throw mapSqlFailure(ex)
        }

        val quoteRow = jdbc.query(
            """SELECT cart_fingerprint, snapshot_hash, policy_version, selected_points, discount_minor, snapshot_revision
               FROM loyalty_quote_snapshots
               WHERE reservation_id=?
               FOR SHARE""",
            { rs, _ ->
                QuoteSnapshotRow(
                    cartFingerprint = rs.getString("cart_fingerprint"),
                    snapshotHash = rs.getString("snapshot_hash"),
                    policyVersion = rs.getString("policy_version"),
                    selectedPoints = rs.getLong("selected_points"),
                    discountMinor = rs.getLong("discount_minor"),
                    snapshotRevision = rs.getLong("snapshot_revision"),
                )
            },
            selection.reservationId,
        ).singleOrNull() ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_MISSING")

        val quoteLineRows = jdbc.query(
            """SELECT q.cart_item_id, q.variant_id, q.profile_id, q.profile_revision, q.quantity,
                      q.original_unit_minor, q.effective_unit_minor, q.existing_discount_state, q.snapshot_revision,
                      p.id p_id, p.variant_id p_variant_id, p.revision p_revision, p.currency p_currency,
                      p.gross_unit_minor p_gross, p.merchandise_unit_minor p_merch, p.excluded_tax_unit_minor p_tax,
                      p.classification p_class, p.evidence_kind p_kind, p.source_reference p_source,
                      p.admin_command_id p_cmd, p.recorded_at p_recorded_at
               FROM loyalty_quote_lines q
               JOIN catalog_loyalty_price_profiles p
                 ON p.id=q.profile_id AND p.variant_id=q.variant_id AND p.revision=q.profile_revision
               WHERE q.reservation_id=?
               ORDER BY q.cart_item_id
               FOR SHARE OF q, p""",
            { rs, _ ->
                val cartLine = LoyaltyCartLine(
                    cartItemId = rs.getLong("cart_item_id"),
                    variantId = rs.getLong("variant_id"),
                    quantity = rs.getLong("quantity"),
                    originalUnitPrice = LoyaltyMinorUnits.fromWire(rs.getLong("original_unit_minor").toString())
                        ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT"),
                    effectiveUnitPrice = LoyaltyMinorUnits.fromWire(rs.getLong("effective_unit_minor").toString())
                        ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT"),
                    discountState = LoyaltyDiscountState.fromWire(rs.getString("existing_discount_state")),
                )
                val profile = LoyaltyPriceProfile(
                    id = rs.getLong("p_id"),
                    variantId = rs.getLong("p_variant_id"),
                    revision = LoyaltyEvidenceRevision.fromWire(rs.getLong("p_revision").toString())
                        ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT"),
                    currency = LoyaltyEvidenceCurrency.fromWire(rs.getString("p_currency")),
                    grossUnit = LoyaltyMinorUnits.fromWire(rs.getLong("p_gross").toString())
                        ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT"),
                    merchandiseExcludingTaxUnit = LoyaltyMinorUnits.fromWire(rs.getLong("p_merch").toString()),
                    excludedTaxUnit = LoyaltyMinorUnits.fromWire(rs.getLong("p_tax").toString()),
                    classification = LoyaltyItemClassification.fromWire(rs.getString("p_class")),
                    kind = LoyaltyEvidenceKind.fromWire(rs.getString("p_kind")),
                    sourceReference = rs.getString("p_source"),
                    authorizingCommandId = rs.getObject("p_cmd", UUID::class.java),
                    recordedAt = rs.getTimestamp("p_recorded_at").toInstant(),
                )
                Triple(cartLine, profile, rs.getLong("snapshot_revision"))
            },
            selection.reservationId,
        )
        if (quoteLineRows.isEmpty() || quoteLineRows.any { it.third != quoteRow.snapshotRevision }) {
            throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")
        }

        val quoteFrozenLines = quoteLineRows.map { (line, profile, _) ->
            when (val admitted = LoyaltyEvidenceAdmissionStep.admit(line, profile, profile.revision, LoyaltyEvidencePurpose.REDEMPTION)) {
                is LoyaltyEvidenceAdmission.Available -> admitted.snapshot
                is LoyaltyEvidenceAdmission.Unavailable -> throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")
            }
        }
        val quoteRev = LoyaltyEvidenceRevision.fromWire(quoteRow.snapshotRevision.toString())
            ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")
        val quoteFp = CartFingerprint.fromWire(quoteRow.cartFingerprint)
            ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")
        val quoteHash = LoyaltyFingerprint.fromWire(quoteRow.snapshotHash)
            ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")
        val selectedPoints = LoyaltyPoints.fromWire(quoteRow.selectedPoints.toString())
            ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")
        val discountMinor = LoyaltyMinorUnits.fromWire(quoteRow.discountMinor.toString())
            ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")

        val quote = LoyaltyQuoteEvidenceStep.rehydrate(
            cartFingerprint = quoteFp,
            revision = quoteRev,
            expectedHash = quoteHash,
            lines = quoteFrozenLines,
            selectedPoints = selectedPoints,
            discountMinor = discountMinor,
        ) ?: throw LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_CORRUPT")

        val currentByCartItemId = currentFrozen.associateBy { it.cart.cartItemId }
        val matchesCurrent = quote.cartFingerprint == cartFingerprint &&
            quote.lines.size == currentFrozen.size &&
            quote.lines.all { qLine -> currentByCartItemId[qLine.cart.cartItemId]?.identity == qLine.identity }
        if (!matchesCurrent) {
            throw LoyaltyCheckoutConflict("LOYALTY_CART_OR_PROFILE_CHANGED")
        }

        return PreparedLoyaltyBind(quote, boundAt)
    }

    override fun commitRedemptionBind(
        customer: CustomerPrincipal,
        selection: LoyaltyCheckoutSelection.Reservation,
        prepared: PreparedLoyaltyBind,
        orderId: Long,
        paymentId: Long,
        itemCorrelations: List<LoyaltyOrderItemCorrelation>,
        shippingMinor: LoyaltyMinorUnits,
    ) {
        val finalEvidence = when (
            val result = LoyaltyFinalEvidenceStep.bind(
                prepared.quote,
                prepared.quote.cartFingerprint,
                itemCorrelations,
                shippingMinor,
            )
        ) {
            is LoyaltyEvidenceAdmission.Available -> result.snapshot
            is LoyaltyEvidenceAdmission.Unavailable ->
                throw LoyaltyCheckoutConflict("LOYALTY_BIND_CONFLICT_${result.reason.wire}")
        }
        val linesJson = encodeFinalLines(finalEvidence)
        try {
            jdbc.queryForObject(
                """SELECT loyalty_bind_checkout_order(
                     ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb
                   )""",
                Object::class.java,
                customer.customerId,
                customer.sessionId,
                selection.reservationId,
                selection.expectedReservationRevision.value,
                orderId,
                paymentId,
                finalEvidence.cartFingerprint.value,
                prepared.quote.hash.value,
                prepared.quote.revision.value,
                finalEvidence.netSubtotal.value,
                finalEvidence.shipping.value,
                finalEvidence.total.value,
                prepared.quote.discount.value,
                finalEvidence.finalEarning.value,
                Timestamp.from(prepared.boundAt),
                linesJson,
            )
        } catch (ex: DataAccessException) {
            throw mapSqlFailure(ex)
        }
    }

    override fun recordZeroRedemptionEarning(
        orderId: Long,
        paymentId: Long,
        cartFingerprint: CartFingerprint,
        cartLines: List<LoyaltyCartLine>,
        itemIdsByCartItemId: Map<Long, Long>,
        eligibility: LoyaltyEligibilityContext,
        shippingMinor: LoyaltyMinorUnits,
    ) {
        val zeroRev = requireNotNull(LoyaltyEvidenceRevision.fromWire("0"))
        val candidates = cartLines.sortedBy { it.cartItemId }.map { line ->
            val orderItemId = itemIdsByCartItemId.getValue(line.cartItemId)
            val head = eligibility.profilesByVariantId.getValue(line.variantId)
            LoyaltyEarningCandidate(orderItemId, line, head.profile, head.latestRevision)
        }
        when (val evidence = LoyaltyEarningEvidenceStep.freeze(cartFingerprint, zeroRev, candidates, shippingMinor)) {
            is LoyaltyEarningEvidence.Available -> {
                val snap = evidence.snapshot
                jdbc.queryForObject(
                    "SELECT loyalty_record_order_earning_evidence(?, ?, ?, 'AVAILABLE', NULL, ?, ?, ?, ?, ?::jsonb)",
                    Object::class.java,
                    orderId,
                    paymentId,
                    snap.cartFingerprint.value,
                    snap.netSubtotal.value,
                    snap.shipping.value,
                    snap.total.value,
                    snap.finalEarning.value,
                    encodeFinalLines(snap),
                )
            }
            is LoyaltyEarningEvidence.Unavailable -> {
                val snap = evidence.snapshot
                val grossSubtotal = cartLines.fold(0L) { acc, line -> acc + line.effectiveUnitPrice.value * line.quantity }
                val totalMinor = grossSubtotal + shippingMinor.value
                jdbc.queryForObject(
                    "SELECT loyalty_record_order_earning_evidence(?, ?, ?, 'UNAVAILABLE', ?, ?, ?, ?, NULL, '[]'::jsonb)",
                    Object::class.java,
                    orderId,
                    paymentId,
                    snap.cartFingerprint.value,
                    snap.reason.wire,
                    grossSubtotal,
                    shippingMinor.value,
                    totalMinor,
                )
            }
        }
    }

    private fun encodeFinalLines(evidence: LoyaltyFinalEvidence): String {
        val array = mapper.createArrayNode()
        evidence.lines.forEach { line ->
            val obj = mapper.createObjectNode()
            obj.put("order_item_id", line.orderItemId)
            obj.put("cart_item_id", line.evidence.cart.cartItemId)
            obj.put("variant_id", line.evidence.cart.variantId)
            obj.put("profile_id", line.evidence.source.id)
            obj.put("profile_revision", line.evidence.source.revision.value)
            obj.put("quantity", line.evidence.cart.quantity)
            obj.put("original_unit_minor", line.evidence.cart.originalUnitPrice.value)
            obj.put("effective_unit_minor", line.evidence.cart.effectiveUnitPrice.value)
            obj.put("gross_minor", line.evidence.grossLineBeforeLoyalty.value)
            obj.put("merchandise_minor", line.evidence.merchandiseExcludingTax.value)
            obj.put("excluded_tax_minor", line.evidence.excludedTax.value)
            obj.put("eligible_minor", line.evidence.eligiblePreRedemption.value)
            obj.put("allocated_discount_minor", line.allocatedDiscount.value)
            obj.put("payable_minor", line.payable.value)
            obj.put("final_earning_minor", line.finalEarning.value)
            obj.put("classification", line.evidence.source.classification.wire)
            obj.put("existing_discount_state", line.evidence.cart.discountState.wire)
            array.add(obj)
        }
        return mapper.writeValueAsString(array)
    }

    private fun mapProfile(rs: ResultSet): LoyaltyPriceProfile {
        val rev = LoyaltyEvidenceRevision.fromWire(rs.getLong("revision").toString())
            ?: throw LoyaltyCheckoutConflict("LOYALTY_PROFILE_CORRUPT")
        val gross = LoyaltyMinorUnits.fromWire(rs.getLong("gross_unit_minor").toString())
            ?: throw LoyaltyCheckoutConflict("LOYALTY_PROFILE_CORRUPT")
        return LoyaltyPriceProfile(
            id = rs.getLong("id"),
            variantId = rs.getLong("variant_id"),
            revision = rev,
            currency = LoyaltyEvidenceCurrency.fromWire(rs.getString("currency")),
            grossUnit = gross,
            merchandiseExcludingTaxUnit = LoyaltyMinorUnits.fromWire(rs.getLong("merchandise_unit_minor").toString()),
            excludedTaxUnit = LoyaltyMinorUnits.fromWire(rs.getLong("excluded_tax_unit_minor").toString()),
            classification = LoyaltyItemClassification.fromWire(rs.getString("classification")),
            kind = LoyaltyEvidenceKind.fromWire(rs.getString("evidence_kind")),
            sourceReference = rs.getString("source_reference"),
            authorizingCommandId = rs.getObject("admin_command_id", UUID::class.java),
            recordedAt = rs.getTimestamp("recorded_at").toInstant(),
        )
    }

    private fun mapSqlFailure(ex: DataAccessException): RuntimeException {
        val detail = rootMessage(ex)
        return when {
            detail.contains("LOYALTY_RESERVATION_NOT_FOUND") -> LoyaltyReservationNotFound()
            detail.contains("LOYALTY_ACTOR_NOT_AUTHORIZED") -> AuthenticationFailed()
            detail.contains("LOYALTY_RESERVATION_NOT_QUOTED") -> LoyaltyCheckoutConflict("LOYALTY_RESERVATION_NOT_QUOTED")
            detail.contains("LOYALTY_RESERVATION_REVISION_MISMATCH") -> LoyaltyCheckoutConflict("LOYALTY_RESERVATION_REVISION_MISMATCH")
            detail.contains("LOYALTY_RESERVATION_EXPIRED") -> LoyaltyCheckoutConflict("LOYALTY_RESERVATION_EXPIRED")
            detail.contains("LOYALTY_CART_FINGERPRINT_MISMATCH") -> LoyaltyCheckoutConflict("LOYALTY_CART_FINGERPRINT_MISMATCH")
            detail.contains("LOYALTY_WALLET_REVISION_EXHAUSTED") -> LoyaltyCheckoutConflict("LOYALTY_WALLET_REVISION_EXHAUSTED")
            detail.contains("LOYALTY_ALLOCATION_CONTRADICTION") -> LoyaltyCheckoutConflict("LOYALTY_ALLOCATION_CONTRADICTION")
            detail.contains("LOYALTY_QUOTE_EVIDENCE_") -> LoyaltyCheckoutConflict("LOYALTY_QUOTE_EVIDENCE_MISMATCH")
            detail.contains("LOYALTY_POLICY_MISMATCH") -> LoyaltyCheckoutConflict("LOYALTY_POLICY_MISMATCH")
            else -> ex
        }
    }

    private fun rootMessage(ex: Throwable): String =
        generateSequence(ex) { it.cause }.mapNotNull { it.message }.joinToString(" ")

    private data class QuoteSnapshotRow(
        val cartFingerprint: String,
        val snapshotHash: String,
        val policyVersion: String,
        val selectedPoints: Long,
        val discountMinor: Long,
        val snapshotRevision: Long,
    )
}
