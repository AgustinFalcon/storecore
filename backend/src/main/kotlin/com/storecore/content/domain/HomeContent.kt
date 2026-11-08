package com.storecore.content.domain

import java.time.Instant

enum class HomeBlockKind(val wire: String) {
    HERO("HERO"),
    CATEGORY_RAIL("CATEGORY_RAIL"),
    PRODUCT_RAIL("PRODUCT_RAIL"),
    PROMO_BANNER("PROMO_BANNER"),
    UNKNOWN("UNKNOWN");

    companion object {
        fun fromWire(raw: String?): HomeBlockKind = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

sealed interface HomeBlockContent

data class HeroContent(val title: String, val body: String, val ctaLabel: String?, val ctaPath: String?) : HomeBlockContent
data class CategoryRailContent(val title: String, val categoryIds: List<Long>) : HomeBlockContent
data class ProductRailContent(val title: String, val skus: List<String>) : HomeBlockContent
data class PromoBannerContent(val title: String, val body: String, val ctaLabel: String?, val ctaPath: String?) : HomeBlockContent
data class UnknownHomeContent(val raw: Map<String, Any?>) : HomeBlockContent

data class HomeSectionDraft(
    val key: String,
    val kind: HomeBlockKind,
    val active: Boolean,
    val sortOrder: Int,
    val content: HomeBlockContent,
)

data class HomeSectionView(
    val key: String,
    val kind: HomeBlockKind,
    val active: Boolean,
    val sortOrder: Int,
    val content: HomeBlockContent,
    val updatedAt: Instant,
)

data class HomeCompositionView(val revision: Long, val sections: List<HomeSectionView>)
