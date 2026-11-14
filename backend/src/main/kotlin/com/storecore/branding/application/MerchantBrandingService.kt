package com.storecore.branding.application

import com.storecore.branding.domain.MerchantBranding
import com.storecore.identity.domain.InternalUserPrincipal

interface MerchantBrandingRepository {
    fun read(): MerchantBranding
    fun replace(actor: InternalUserPrincipal, branding: MerchantBranding): MerchantBranding
}

class MerchantBrandingService(private val repository: MerchantBrandingRepository) {
    fun read(): MerchantBranding = repository.read()
    fun replace(actor: InternalUserPrincipal, branding: MerchantBranding): MerchantBranding = repository.replace(actor, branding)
}
