package com.storecore.customers

import com.storecore.customers.application.CustomerAdministrationRepository
import com.storecore.customers.application.CustomerAdministrationService
import com.storecore.customers.application.CustomerSearchInvalid
import com.storecore.customers.application.CustomerStateInvalid
import com.storecore.customers.domain.CustomerAccountState
import com.storecore.customers.domain.CustomerPage
import com.storecore.customers.domain.CustomerSearch
import com.storecore.customers.domain.CustomerSummary
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.domain.InternalRole
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CustomerAdministrationClosedTypesTest {
    private val repository = object : CustomerAdministrationRepository {
        override fun search(criteria: CustomerSearch) = CustomerPage(emptyList(), criteria.page, criteria.pageSize, 0)
        override fun find(id: Long): CustomerSummary? = null
        override fun changeState(actor: InternalUserPrincipal, id: Long, target: CustomerAccountState): CustomerSummary = error("must not persist")
    }

    @Test fun `unknown account state fails closed`() {
        assertEquals(CustomerAccountState.UNKNOWN, CustomerAccountState.fromWire("ACTIVE "))
        assertEquals(CustomerAccountState.SUSPENDED, CustomerAccountState.fromActive(false))
        assertFailsWith<CustomerStateInvalid> { CustomerAdministrationService(repository).changeState(errorActor(), 1, CustomerAccountState.UNKNOWN) }
    }

    @Test fun `query and page bounds are explicit`() {
        val service = CustomerAdministrationService(repository)
        assertFailsWith<CustomerSearchInvalid> { service.search("x", null, 0) }
        assertFailsWith<CustomerSearchInvalid> { service.search("valid", null, -1) }
        assertEquals(25, service.search("  valid  ", CustomerAccountState.ACTIVE, null).pageSize)
    }

    private fun errorActor(): InternalUserPrincipal = InternalUserPrincipal(UUID.randomUUID(), 1, setOf(InternalRole.ADMIN))
}
