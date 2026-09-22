package com.storecore.identity.application

import com.storecore.identity.domain.AuthenticatedPrincipal
import com.storecore.identity.domain.CustomerAddress
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.CustomerProfile
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.IssuedCredentials
import com.storecore.identity.domain.InternalUserPrincipal
import java.util.UUID

interface IdentityUseCases {
    fun registerCustomer(email: String, password: String, firstName: String, lastName: String): IssuedCredentials
    fun login(realm: IdentityRealm, email: String, password: String, sourceIp: String = "unknown"): IssuedCredentials
    fun authenticate(realm: IdentityRealm, rawToken: String): AuthenticatedPrincipal
    fun rotateCsrf(principal: AuthenticatedPrincipal): String
    fun verifyCsrf(principal: AuthenticatedPrincipal, rawCsrf: String)
    fun logout(principal: AuthenticatedPrincipal)
    fun revokeAsAdmin(actor: InternalUserPrincipal, targetSession: UUID, reason: String, correlation: UUID)
    fun revokeAsSystem(targetSession: UUID, reason: String, correlation: UUID)
    fun customerProfile(principal: CustomerPrincipal): CustomerProfile
    fun updateCustomerProfile(principal: CustomerPrincipal, email: String, firstName: String, lastName: String, phone: String?): CustomerProfile
    fun customerAddresses(principal: CustomerPrincipal): List<CustomerAddress>
    fun updateCustomerAddress(principal: CustomerPrincipal, addressId: Long, street: String, number: String, city: String, province: String, postalCode: String, isDefault: Boolean): CustomerAddress
    fun deleteCustomerAddress(principal: CustomerPrincipal, addressId: Long)
    fun addCustomerAddress(principal: CustomerPrincipal, street: String, number: String, city: String, province: String, postalCode: String, isDefault: Boolean): CustomerAddress
}