package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.CheckoutContextChanged
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.loyalty.application.LoyaltyCheckoutPlan
import com.storecore.loyalty.domain.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.util.UUID

/** Joins the existing local checkout transaction; no provider or independent transaction. */
@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class LoyaltyCheckoutEvidenceService(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun lockCatalog(customer: CustomerPrincipal, variants: List<Long>) {
        jdbc.execute(ConnectionCallback<Unit> { connection ->
            connection.prepareStatement("SELECT loyalty_lock_checkout_catalog(?,?,?)").use { statement ->
                statement.setLong(1, customer.customerId)
                statement.setObject(2, customer.sessionId)
                statement.setArray(3, connection.createArrayOf("bigint", variants.distinct().sorted().toTypedArray()))
                statement.execute()
            }
        })
    }

    fun prepare(customer: CustomerPrincipal, selection: CheckoutLoyaltySelection, fingerprint: CartFingerprint,
                lines: List<LoyaltyCartLine>): LoyaltyCheckoutPlan {
        require(selection != CheckoutLoyaltySelection.Unknown)
        val selected = selection as? CheckoutLoyaltySelection.Reservation
        val discount = jdbc.queryForObject("SELECT loyalty_prepare_checkout(?,?,?,?,?)", Long::class.java,
            customer.customerId, customer.sessionId, selected?.reservationId, selected?.expectedRevision?.value, fingerprint.value)!!
        val candidates = lines.sortedBy { it.cartItemId }.map { line ->
            val profile = jdbc.query("SELECT * FROM catalog_loyalty_price_profiles WHERE variant_id=? ORDER BY revision DESC LIMIT 1", { rs, _ ->
                LoyaltyPriceProfile(rs.getLong("id"), rs.getLong("variant_id"),
                    requireNotNull(LoyaltyEvidenceRevision.fromWire(rs.getString("revision"))),
                    LoyaltyEvidenceCurrency.fromWire(rs.getString("currency")), minor(rs.getBigDecimal("gross_unit_minor"), false),
                    minor(rs.getBigDecimal("merchandise_unit_minor"), false), minor(rs.getBigDecimal("excluded_tax_unit_minor"), false),
                    LoyaltyItemClassification.fromWire(rs.getString("classification")), LoyaltyEvidenceKind.fromWire(rs.getString("evidence_kind")),
                    rs.getString("source_reference"), rs.getObject("admin_command_id", UUID::class.java), rs.getTimestamp("recorded_at").toInstant())
            }, line.variantId).singleOrNull()
            LoyaltyEarningCandidate(0, line, profile, profile?.revision ?: revisionZero)
        }
        if (selected == null) {
            val reason = candidates.map { LoyaltyEvidenceAdmissionStep.admit(it.cart, it.source, it.latestProfileRevision, LoyaltyEvidencePurpose.EARNING) }
                .filterIsInstance<LoyaltyEvidenceAdmission.Unavailable>().firstOrNull()?.reason
            return LoyaltyCheckoutPlan(fingerprint, revisionZero, candidates, null, reason)
        }
        val stored = jdbc.query("SELECT snapshot_hash,snapshot_revision,selected_points,discount_minor FROM loyalty_quote_snapshots WHERE reservation_id=?", { rs, _ ->
            StoredQuote(rs.getString("snapshot_hash"), requireNotNull(LoyaltyEvidenceRevision.fromWire(rs.getString("snapshot_revision"))),
                requireNotNull(LoyaltyPoints.fromWire(rs.getString("selected_points"))), rs.getLong("discount_minor"))
        }, selected.reservationId).singleOrNull() ?: throw CheckoutContextChanged()
        val admitted = candidates.map {
            when (val result = LoyaltyEvidenceAdmissionStep.admit(it.cart, it.source, it.latestProfileRevision, LoyaltyEvidencePurpose.REDEMPTION)) {
                is LoyaltyEvidenceAdmission.Available -> result.snapshot
                is LoyaltyEvidenceAdmission.Unavailable -> throw CheckoutContextChanged()
            }
        }
        val quote = LoyaltyQuoteEvidenceStep.freeze(fingerprint, stored.revision, admitted, stored.points, stored.points)
        if (quote !is LoyaltyEvidenceAdmission.Available || quote.snapshot.hash.value != stored.hash ||
            quote.snapshot.discount.value != discount || stored.discount != discount) throw CheckoutContextChanged()
        return LoyaltyCheckoutPlan(fingerprint, stored.revision, candidates, quote.snapshot, null)
    }

    fun freeze(customer: CustomerPrincipal, selection: CheckoutLoyaltySelection, plan: LoyaltyCheckoutPlan,
               orderId: Long, paymentId: Long, orderItems: Map<Long, Long>, shipping: BigDecimal) {
        val result = plan.finish(orderItems, minor(shipping))
        val selected = selection as? CheckoutLoyaltySelection.Reservation
        val lines = when (result) {
            is LoyaltyEarningEvidence.Unavailable -> emptyList()
            is LoyaltyEarningEvidence.Available -> result.snapshot.lines.map { line ->
                val e = line.evidence
                mapOf("order_item_id" to line.orderItemId, "cart_item_id" to e.cart.cartItemId, "variant_id" to e.cart.variantId,
                    "profile_id" to e.source.id, "profile_revision" to e.source.revision.value, "quantity" to e.cart.quantity,
                    "original_unit_minor" to e.cart.originalUnitPrice.value, "effective_unit_minor" to e.cart.effectiveUnitPrice.value,
                    "gross_minor" to e.grossLineBeforeLoyalty.value, "merchandise_minor" to e.merchandiseExcludingTax.value,
                    "excluded_tax_minor" to e.excludedTax.value, "eligible_minor" to e.eligiblePreRedemption.value,
                    "allocated_discount_minor" to line.allocatedDiscount.value, "payable_minor" to line.payable.value,
                    "final_earning_minor" to line.finalEarning.value, "classification" to e.source.classification.wire,
                    "existing_discount_state" to e.cart.discountState.wire)
            }
        }
        val reason = (result as? LoyaltyEarningEvidence.Unavailable)?.snapshot?.reason?.wire
        jdbc.queryForList("SELECT loyalty_freeze_checkout(?,?,?,?,?,?,?,?::jsonb,?)", customer.customerId, customer.sessionId,
            selected?.reservationId, selected?.expectedRevision?.value, orderId, paymentId, plan.cartFingerprint.value,
            mapper.writeValueAsString(lines), reason)
    }

    private data class StoredQuote(val hash: String, val revision: LoyaltyEvidenceRevision, val points: LoyaltyPoints, val discount: Long)
    companion object {
        private val revisionZero = requireNotNull(LoyaltyEvidenceRevision.fromWire("0"))
        fun minor(value: BigDecimal, currencyAmount: Boolean = true): LoyaltyMinorUnits = requireNotNull(
            LoyaltyMinorUnits.of((if (currencyAmount) value.movePointRight(2) else value).longValueExact()))
    }
}
