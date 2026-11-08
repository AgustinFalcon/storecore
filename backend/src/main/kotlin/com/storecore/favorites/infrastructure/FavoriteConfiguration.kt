package com.storecore.favorites.infrastructure

import com.storecore.favorites.application.FavoriteRepository
import com.storecore.favorites.application.FavoriteService
import com.storecore.favorites.application.FavoriteUseCases
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
class FavoriteConfiguration {
    @Bean fun favoriteUseCases(repository: FavoriteRepository): FavoriteUseCases = FavoriteService(repository)
}
