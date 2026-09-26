package com.storecore.commerce.application.port.output

import com.storecore.commerce.domain.EffectivePrice

/** Reads one consistent, priority-resolved price policy for catalog and cart consumers. */
interface EffectivePriceQueryPort {
    fun findBySkus(skus: Collection<String>): Map<String, EffectivePrice>
}