package com.storecore.identity.application

import com.storecore.identity.domain.*

class EmailVerificationUnavailable : RuntimeException("EMAIL_VERIFICATION_UNAVAILABLE")
class EmailVerificationRateLimited(val retryAfterSeconds: Long) : RuntimeException("EMAIL_VERIFICATION_RATE_LIMITED")
private class VerificationEnqueueRejected : RuntimeException()

interface EmailVerificationUseCases {
    fun ownership(principal: AuthenticatedPrincipal): EmailOwnershipState
    fun request(principal: AuthenticatedPrincipal): VerificationRequestState
    fun inspect(realm: RecoveryRealm, token: String, sourceIp: String): EmailVerificationInspection
    fun complete(realm: RecoveryRealm, token: String, sourceIp: String): EmailVerificationCompletion
}
interface EmailVerificationRepository {
    fun ownership(subject: IdentitySubject): EmailOwnershipState
    fun issue(principal: AuthenticatedPrincipal): EmailVerificationDispatch?
    fun inspect(realm: RecoveryRealm, secret: VerificationSecret): EmailVerificationInspection
    fun complete(realm: RecoveryRealm, secret: VerificationSecret): EmailVerificationCompletion
}
interface EmailVerificationDeliveryPort {
    val readiness: EmailDeliveryReadiness
    fun enqueue(dispatch: EmailVerificationDispatch): EmailDeliveryReadiness
}
interface EmailVerificationBudgetPort {
    fun request(subject: IdentitySubject)
    fun token(sourceIp: String, tokenHash: String): EmailVerificationAttempt
}
interface VerificationTokenPort { fun nextRawToken(): String; fun sha256(raw: String): String }
interface EmailVerificationTransactions { fun <T : Any> execute(effect: () -> T): T }
interface EmailVerificationAttempt { fun finish(success: Boolean) }

class RequestEmailVerificationStep(
    private val repository: EmailVerificationRepository, private val delivery: EmailVerificationDeliveryPort,
    private val budgets: EmailVerificationBudgetPort, private val transactions: EmailVerificationTransactions,
) {
    fun execute(principal: AuthenticatedPrincipal): VerificationRequestState {
        if (!delivery.readiness.permitsEnqueue) throw EmailVerificationUnavailable()
        budgets.request(IdentitySubject.of(principal))
        try {
            transactions.execute {
                repository.issue(principal)?.let { dispatch ->
                    val accepted = try { delivery.enqueue(dispatch).permitsEnqueue } catch (_: RuntimeException) { false }
                    if (!accepted) throw VerificationEnqueueRejected()
                }
                VerificationRequestState.ACCEPTED
            }
        } catch (_: VerificationEnqueueRejected) {
            // Roll back authorization together with the failed durable enqueue.
        }
        return VerificationRequestState.ACCEPTED
    }
}

class InspectEmailVerificationStep(
    private val repository: EmailVerificationRepository, private val budgets: EmailVerificationBudgetPort, private val tokens: VerificationTokenPort,
) {
    fun execute(realm: RecoveryRealm, raw: String, ip: String): EmailVerificationInspection {
        val attempt = budgets.token(ip, tokens.sha256(raw))
        return try {
            val result = if (realm == RecoveryRealm.Unknown) EmailVerificationInspection.terminal(EmailVerificationStatus.INVALID_LINK)
                else VerificationSecret.fromWire(raw)?.let { repository.inspect(realm, it) }
                    ?: EmailVerificationInspection.terminal(EmailVerificationStatus.INVALID_LINK)
            attempt.finish(result.status == EmailVerificationStatus.READY)
            result
        } catch (failure: RuntimeException) { attempt.finish(false); throw failure }
    }
}

class CompleteEmailVerificationStep(
    private val repository: EmailVerificationRepository, private val budgets: EmailVerificationBudgetPort,
    private val tokens: VerificationTokenPort, private val transactions: EmailVerificationTransactions,
) {
    fun execute(realm: RecoveryRealm, raw: String, ip: String): EmailVerificationCompletion {
        val attempt = budgets.token(ip, tokens.sha256(raw))
        return try {
            val secret = VerificationSecret.fromWire(raw)
            val result = if (realm == RecoveryRealm.Unknown || secret == null) EmailVerificationCompletion.INVALID_LINK
                else transactions.execute { repository.complete(realm, secret) }
            attempt.finish(result == EmailVerificationCompletion.VERIFIED)
            result
        } catch (failure: RuntimeException) { attempt.finish(false); throw failure }
    }
}

class EmailVerificationService(
    private val repository: EmailVerificationRepository, private val requestStep: RequestEmailVerificationStep,
    private val inspectStep: InspectEmailVerificationStep, private val completeStep: CompleteEmailVerificationStep,
) : EmailVerificationUseCases {
    override fun ownership(principal: AuthenticatedPrincipal) = repository.ownership(IdentitySubject.of(principal))
    override fun request(principal: AuthenticatedPrincipal) = requestStep.execute(principal)
    override fun inspect(realm: RecoveryRealm, token: String, sourceIp: String) = inspectStep.execute(realm, token, sourceIp)
    override fun complete(realm: RecoveryRealm, token: String, sourceIp: String) = completeStep.execute(realm, token, sourceIp)
}
