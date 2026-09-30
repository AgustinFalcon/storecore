package com.storecore.blackstore.application

class BlackStoreUnauthorized : BlackStoreIntegrationException("UNAUTHORIZED", 401, retryable = false)

class BlackStoreForbidden : BlackStoreIntegrationException("FORBIDDEN", 403, retryable = false)

class BlackStoreProviderUnavailable : BlackStoreIntegrationException("INTERNAL", 500, retryable = true)
