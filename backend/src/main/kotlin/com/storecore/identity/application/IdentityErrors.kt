package com.storecore.identity.application

sealed class IdentityException(message: String) : RuntimeException(message)
class AuthenticationFailed : IdentityException("AUTHENTICATION_FAILED")
class LoginRateLimited(val retryAfterSeconds: Long) : IdentityException("AUTH_RATE_LIMITED")
class AuthorizationDenied : IdentityException("AUTHORIZATION_DENIED")
class CsrfInvalid : IdentityException("CSRF_INVALID")
class ResourceNotFound : IdentityException("RESOURCE_NOT_FOUND")
class RegistrationRejected : IdentityException("REGISTRATION_REJECTED")
class AccessChallengeRejected : IdentityException("AUTHENTICATION_FAILED")
class UnifiedOriginRejected : IdentityException("CSRF_INVALID")
class ClientAddressRejected : IdentityException("REQUEST_VALIDATION_FAILED")
