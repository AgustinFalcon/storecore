package com.storecore.favorites.application

import com.storecore.favorites.domain.FavoriteItem
import com.storecore.favorites.domain.FavoriteMutation
import com.storecore.identity.domain.CustomerPrincipal

interface FavoriteRepository {
    fun list(customer: CustomerPrincipal): List<FavoriteItem>
    fun add(customer: CustomerPrincipal, sku: String): FavoriteMutation
    fun remove(customer: CustomerPrincipal, sku: String): FavoriteMutation
}

interface FavoriteUseCases {
    fun list(customer: CustomerPrincipal): List<FavoriteItem>
    fun add(customer: CustomerPrincipal, sku: String): FavoriteMutation
    fun remove(customer: CustomerPrincipal, sku: String): FavoriteMutation
}
