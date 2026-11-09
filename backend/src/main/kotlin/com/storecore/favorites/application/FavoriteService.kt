package com.storecore.favorites.application

import com.storecore.favorites.domain.FavoriteItem
import com.storecore.favorites.domain.FavoriteMutation
import com.storecore.identity.domain.CustomerPrincipal
class FavoriteService(private val repository: FavoriteRepository) : FavoriteUseCases {
    override fun list(customer: CustomerPrincipal): List<FavoriteItem> = repository.list(customer)
    override fun add(customer: CustomerPrincipal, sku: String): FavoriteMutation = repository.add(customer, sku)
    override fun remove(customer: CustomerPrincipal, sku: String): FavoriteMutation = repository.remove(customer, sku)
}

class FavoriteProductUnavailable : RuntimeException("PRODUCT_NOT_AVAILABLE")
class FavoriteLimitReached : RuntimeException("LIMIT_REACHED")
