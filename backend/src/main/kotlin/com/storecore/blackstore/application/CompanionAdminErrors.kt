package com.storecore.blackstore.application

sealed class CompanionAdminException(message: String) : RuntimeException(message)
class CompanionAdminPoolMissing : CompanionAdminException("COMPANION_ADMIN_POOL_MISSING")
class CompanionAdminPayloadConflict : CompanionAdminException("COMPANION_ADMIN_PAYLOAD_CONFLICT")
class CompanionAdminSessionDenied : CompanionAdminException("COMPANION_ADMIN_SESSION_DENIED")
class CompanionAdminCommandAborted : CompanionAdminException("COMPANION_ADMIN_COMMAND_ABORTED")
class CompanionAdminCorrelationRequired : CompanionAdminException("COMPANION_ADMIN_CORRELATION_REQUIRED")
