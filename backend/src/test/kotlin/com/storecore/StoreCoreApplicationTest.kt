package com.storecore

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest(properties = ["spring.flyway.enabled=false", "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration", "storecore.installation-guard.enabled=false", "storecore.identity.enabled=false"])
class StoreCoreApplicationTest {
    @Test
    fun contextLoads() = Unit
}
