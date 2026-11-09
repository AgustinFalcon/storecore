package com.storecore

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.ApplicationContext

@SpringBootTest(properties = ["spring.flyway.enabled=false", "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration", "storecore.installation-guard.enabled=false", "storecore.identity.enabled=false"])
class StoreCoreApplicationTest(@Autowired private val context: ApplicationContext) {
    @Test
    fun contextLoads() {
        assertTrue(context.getBeansOfType(javax.sql.DataSource::class.java).isEmpty())
        assertTrue(context.getBeansOfType(org.springframework.jdbc.core.JdbcTemplate::class.java).isEmpty())
        val authenticatedComponents = listOf(
            com.storecore.customers.infrastructure.CustomerAdministrationController::class.java,
            com.storecore.customers.infrastructure.JdbcCustomerAdministrationRepository::class.java,
            com.storecore.customers.application.CustomerAdministrationUseCases::class.java,
            com.storecore.favorites.infrastructure.FavoriteController::class.java,
            com.storecore.favorites.infrastructure.JdbcFavoriteRepository::class.java,
            com.storecore.favorites.application.FavoriteUseCases::class.java,
            com.storecore.offers.infrastructure.OfferController::class.java,
            com.storecore.offers.infrastructure.JdbcOfferRepository::class.java,
            com.storecore.offers.application.OfferUseCases::class.java,
            com.storecore.overview.infrastructure.OverviewController::class.java,
            com.storecore.overview.infrastructure.JdbcOverviewRepository::class.java,
            com.storecore.overview.application.OverviewUseCases::class.java,
        )
        authenticatedComponents.forEach { type ->
            assertTrue(context.getBeansOfType(type).isEmpty(), "${type.simpleName} must be absent when identity is disabled")
        }
    }
}
