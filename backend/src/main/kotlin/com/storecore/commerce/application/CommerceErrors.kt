package com.storecore.commerce.application

sealed class CommerceException(message: String, val retryable: Boolean = false) : RuntimeException(message)
class CheckoutConflict : CommerceException("CHECKOUT_IDEMPOTENCY_CONFLICT")
class PromoWindowOverlap : CommerceException("PROMO_WINDOW_OVERLAP")
class MercadoLibreAccountMissing : CommerceException("ML_ACCOUNT_NOT_AUTHORIZED", retryable = true)
class CommerceValidation(code: String = "REQUEST_VALIDATION_FAILED") : CommerceException(code)
class InsufficientInventory : CommerceException("INSUFFICIENT_INVENTORY")
class ProfileRejected(code: String = "PROFILE_REJECTED") : CommerceException(code)
class FulfillmentRejected : CommerceException("FULFILLMENT_TRANSITION_REJECTED")
class WebhookRateLimited(val retryAfterSeconds: Long) : CommerceException("WEBHOOK_RATE_LIMITED", retryable = true)
class WebhookPayloadTooLarge : CommerceException("WEBHOOK_PAYLOAD_TOO_LARGE")
