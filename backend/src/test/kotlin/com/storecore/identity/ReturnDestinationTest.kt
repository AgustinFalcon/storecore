package com.storecore.identity

import com.storecore.identity.domain.AccessContext
import com.storecore.identity.domain.AccessHome
import com.storecore.identity.domain.ReturnDestination
import org.junit.jupiter.api.Test
import kotlin.test.*

class ReturnDestinationTest {
    @Test
    fun `only exact registered wire values are translated`() {
        listOf(null, "", "customer", " CUSTOMER ", "ADMIN").forEach { assertEquals(AccessContext.Unknown, AccessContext.fromWire(it)) }
        assertEquals(AccessContext.CUSTOMER, AccessContext.fromWire("CUSTOMER"))
        assertEquals(AccessContext.USER, AccessContext.fromWire("USER"))
        assertEquals(AccessHome.Unknown, AccessHome.fromWire("operations"))
        assertEquals(AccessHome.OPERATIONS, AccessHome.fromWire("OPERATIONS"))
        assertEquals(ReturnDestination.Unknown, ReturnDestination.fromWire("unknown-route"))
        assertEquals(ReturnDestination.USER_ORDERS, ReturnDestination.fromWire("USER_ORDERS"))
        assertEquals(ReturnDestination.Unknown, ReturnDestination.HOME.permittedFor(AccessContext.Unknown))
        assertEquals(ReturnDestination.HOME, ReturnDestination.Unknown.permittedFor(AccessContext.CUSTOMER))
    }

    @Test
    fun `v1 exact route matrix translates once`() {
        mapOf("/" to ReturnDestination.HOME, "/user/home" to ReturnDestination.HOME,
            "/catalog" to ReturnDestination.CATALOG, "/customer/profile" to ReturnDestination.CUSTOMER_PROFILE,
            "/customer/orders" to ReturnDestination.CUSTOMER_ORDERS, "/user/orders" to ReturnDestination.USER_ORDERS,
        ).forEach { (route, expected) -> assertEquals(expected, ReturnDestination.fromReturnPath(route)) }
    }

    @Test
    fun `unsafe excluded and overlong return paths fall back to home`() {
        listOf(null, "", "https://evil.example/catalog", "//evil.example/catalog", "/\\evil.example", "/catalog?role=ADMIN",
            "/catalog#fragment", "/%63atalog", "/customer/../user/orders", " /catalog", "/catalog/", "/cart", "/checkout",
            "/customer/addresses", "/customer/orders/12", "/user/inventory", "/" + "a".repeat(2048),
            "/" + "a".repeat(4095), "/" + "a".repeat(4096),
        ).forEach { assertEquals(ReturnDestination.HOME, ReturnDestination.fromReturnPath(it), "route=$it") }
    }

    @Test
    fun `context compatibility preserves public routes and rejects cross realm destinations`() {
        listOf(AccessContext.CUSTOMER, AccessContext.USER).forEach { assertEquals(ReturnDestination.CATALOG, ReturnDestination.CATALOG.permittedFor(it)) }
        assertEquals(ReturnDestination.HOME, ReturnDestination.USER_ORDERS.permittedFor(AccessContext.CUSTOMER))
        assertEquals(ReturnDestination.HOME, ReturnDestination.CUSTOMER_ORDERS.permittedFor(AccessContext.USER))
        assertEquals(ReturnDestination.USER_ORDERS, ReturnDestination.USER_ORDERS.permittedFor(AccessContext.USER))
    }
}
