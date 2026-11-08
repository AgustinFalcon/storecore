package com.storecore.customers.application

import com.storecore.customers.domain.CustomerAccountState
import com.storecore.customers.domain.CustomerPage
import com.storecore.customers.domain.CustomerSearch
import com.storecore.customers.domain.CustomerSummary
import com.storecore.identity.domain.InternalUserPrincipal

class CustomerAdministrationService(private val repository: CustomerAdministrationRepository) : CustomerAdministrationUseCases {
    override fun search(query: String?, state: CustomerAccountState?, page: Int?): CustomerPage {
        val normalizedQuery = query?.trim().orEmpty()
        val normalizedPage = page ?: 0
        if ((normalizedQuery.isNotEmpty() && normalizedQuery.length !in 2..100) ||
            state == CustomerAccountState.UNKNOWN || normalizedPage !in 0..1_000_000
        ) throw CustomerSearchInvalid()
        return repository.search(CustomerSearch(normalizedQuery, state, normalizedPage))
    }

    override fun find(id: Long): CustomerSummary {
        if (id <= 0) throw CustomerNotFound()
        return repository.find(id) ?: throw CustomerNotFound()
    }

    override fun changeState(actor: InternalUserPrincipal, id: Long, target: CustomerAccountState): CustomerSummary {
        if (id <= 0) throw CustomerNotFound()
        if (target == CustomerAccountState.UNKNOWN) throw CustomerStateInvalid()
        return repository.changeState(actor, id, target)
    }
}

class CustomerSearchInvalid : RuntimeException("CUSTOMER_SEARCH_INVALID")
class CustomerStateInvalid : RuntimeException("CUSTOMER_STATE_INVALID")
class CustomerNotFound : RuntimeException("CUSTOMER_NOT_FOUND")
