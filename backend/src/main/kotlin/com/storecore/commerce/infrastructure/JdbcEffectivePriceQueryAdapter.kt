package com.storecore.commerce.infrastructure

import com.storecore.catalog.application.port.output.PriceQuotePort
import com.storecore.commerce.application.port.output.EffectivePriceQueryPort
import com.storecore.commerce.domain.EffectivePrice
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Repository

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcEffectivePriceQueryAdapter(private val quotes: PriceQuotePort) : EffectivePriceQueryPort {
    override fun findBySkus(skus: Collection<String>): Map<String, EffectivePrice> {
        val asOf = quotes.clock()
        return quotes.quoteBySkus(asOf, skus).mapValues { (_, quote) ->
            EffectivePrice(
                variantId = quote.variantId,
                sku = quote.sku,
                basePrice = quote.basePrice,
                discountAmount = quote.discountAmount,
                effectivePrice = quote.effectivePrice,
                offerRef = quote.offerId?.toString(),
                campaignRef = quote.campaignRef,
                active = quote.sellableActive,
                validFrom = quote.validFrom,
                validUntil = quote.validUntil,
                priceVersion = quote.priceVersion.wire,
            )
        }
    }
}
