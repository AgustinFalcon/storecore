package com.storecore.favorites.domain

import java.math.BigDecimal
import java.time.Instant

enum class FavoriteAvailability(val wire: String) {
    AVAILABLE("AVAILABLE"), UNAVAILABLE("UNAVAILABLE"), UNKNOWN("unknown");
    companion object { fun fromWire(raw: String?): FavoriteAvailability = entries.firstOrNull { it.wire == raw } ?: UNKNOWN }
}

enum class FavoriteMutationOutcome(val wire: String) {
    ADDED("ADDED"), ALREADY_PRESENT("ALREADY_PRESENT"), REMOVED("REMOVED"), ALREADY_ABSENT("ALREADY_ABSENT"), LIMIT_REACHED("LIMIT_REACHED"), UNKNOWN("unknown");
    companion object { fun fromWire(raw: String?): FavoriteMutationOutcome = entries.firstOrNull { it.wire == raw } ?: UNKNOWN }
}

data class FavoriteItem(val sku: String, val name: String, val price: BigDecimal?, val imageUrl: String?, val availability: FavoriteAvailability, val addedAt: Instant, val priceResolution: com.storecore.catalog.domain.SkuPriceResolution)
data class FavoriteMutation(val sku: String, val outcome: FavoriteMutationOutcome)
