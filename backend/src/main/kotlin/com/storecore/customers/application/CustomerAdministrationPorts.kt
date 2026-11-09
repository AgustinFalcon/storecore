package com.storecore.customers.application

import com.storecore.customers.domain.CustomerAccountState
import com.storecore.customers.domain.CustomerPage
import com.storecore.customers.domain.CustomerSearch
import com.storecore.customers.domain.CustomerSummary
import com.storecore.identity.domain.InternalUserPrincipal

interface CustomerAdministrationRepository {
    fun search(criteria: CustomerSearch): CustomerPage
    fun find(id: Long): CustomerSummary?
    fun changeState(actor: InternalUserPrincipal, id: Long, target: CustomerAccountState): CustomerSummary
}

interface CustomerAdministrationUseCases {
    fun search(query: String?, state: CustomerAccountState?, page: Int?): CustomerPage
    fun find(id: Long): CustomerSummary
    fun changeState(actor: InternalUserPrincipal, id: Long, target: CustomerAccountState): CustomerSummary
}
