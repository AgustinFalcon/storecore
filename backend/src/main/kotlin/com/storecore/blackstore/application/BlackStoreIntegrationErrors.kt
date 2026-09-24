package com.storecore.blackstore.application

open class BlackStoreIntegrationException(message: String, val httpStatus: Int, val retryable: Boolean = false) : RuntimeException(message)

class BlackStoreCapabilityDisabled : BlackStoreIntegrationException("CAPABILITY_DISABLED", 403)

class BlackStoreOperationRetired : BlackStoreIntegrationException("OPERATION_RETIRED", 410)

class BlackStoreNotModified(val etag: String) : RuntimeException("NOT_MODIFIED")
