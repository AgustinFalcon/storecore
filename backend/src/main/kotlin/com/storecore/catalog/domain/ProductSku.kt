package com.storecore.catalog.domain

/** Canonical catalog identity. The domain has no framework dependency. */
@JvmInline
value class ProductSku(val value: String) {
    init {
        require(value.isNotBlank()) { "SKU must not be blank" }
    }
}
