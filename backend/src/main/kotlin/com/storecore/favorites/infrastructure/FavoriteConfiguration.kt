package com.storecore.favorites.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.favorites.application.FavoriteRepository
import com.storecore.favorites.application.FavoriteService
import com.storecore.favorites.application.FavoriteUseCases
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class FavoriteConfiguration {
    @Bean fun favoriteUseCases(repository: FavoriteRepository): FavoriteUseCases = FavoriteService(repository)
}
