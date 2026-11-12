package com.storecore.identity.application

import com.storecore.identity.domain.*

sealed class RecoveryException(message: String) : RuntimeException(message)
class RecoveryUnavailable : RecoveryException("RECOVERY_UNAVAILABLE")
class RecoveryRateLimited(val retryAfterSeconds: Long) : RecoveryException("RECOVERY_RATE_LIMITED")
class RecoveryRequestInvalid : RecoveryException("REQUEST_VALIDATION_FAILED")
class RecoveryPasswordRejected : RecoveryException("PASSWORD_POLICY_VIOLATION")
private class DeliveryRejected : RuntimeException()

interface RecoveryUseCases {
    fun request(realm: RecoveryRealm, email: String, sourceIp: String): RecoveryRequestResult
    fun inspect(realm: RecoveryRealm, token: String, sourceIp: String): RecoveryInspection
    fun complete(realm: RecoveryRealm, token: String, password: String, sourceIp: String): RecoveryCompletionResult
}

interface RecoveryRepository {
    fun issue(realm: RecoveryRealm, email: CanonicalEmail): RecoveryDispatch?
    fun inspect(realm: RecoveryRealm, token: RecoverySecret): RecoveryInspection
    fun complete(realm: RecoveryRealm, token: RecoverySecret, password: RecoveryPassword): RecoveryCompletionResult
}
interface RecoveryDeliveryPort {
    val state: RecoveryDeliveryState
    fun deliver(dispatch: RecoveryDispatch): RecoveryDeliveryState
}
interface RecoveryTokenPort {
    fun nextRawToken(): String
    fun sha256(raw: String): String
}
interface RecoveryPasswordHasher { fun hash(password: CharArray): String }
interface RecoveryTransactions { fun <T : Any> execute(effect: () -> T): T }
interface RecoveryAttempt { fun finish(success: Boolean) }
interface RecoveryBudgetPort {
    /** False means destination suppression; aggregate/cardinality limits throw. */
    fun request(sourceIp: String, realm: RecoveryRealm, emailDigest: String): Boolean
    fun token(sourceIp: String, tokenHash: String): RecoveryAttempt
}

class RequestRecoveryStep(
    private val repository: RecoveryRepository,
    private val delivery: RecoveryDeliveryPort,
    private val budgets: RecoveryBudgetPort,
    private val tokens: RecoveryTokenPort,
    private val transactions: RecoveryTransactions,
) {
    fun execute(realm: RecoveryRealm, email: String, ip: String): RecoveryRequestResult {
        if (realm == RecoveryRealm.Unknown) throw RecoveryRequestInvalid()
        val canonical = CanonicalEmail.fromWire(email) ?: throw RecoveryRequestInvalid()
        val allowed = budgets.request(ip, realm, tokens.sha256(canonical.value))
        if (delivery.state != RecoveryDeliveryState.READY) throw RecoveryUnavailable()
        if (!allowed) return RecoveryRequestResult.ACCEPTED
        try {
            transactions.execute {
                repository.issue(realm, canonical)?.let {
                    val result = try { delivery.deliver(it) } catch (_: RuntimeException) { throw DeliveryRejected() }
                    if (result != RecoveryDeliveryState.ACCEPTED) throw DeliveryRejected()
                }
                RecoveryRequestResult.ACCEPTED
            }
        } catch (_: DeliveryRejected) {
            // A configured local adapter failure cannot turn existence into a public oracle.
            // Throwing inside the transaction rolls the unusable authorization back.
        }
        return RecoveryRequestResult.ACCEPTED
    }
}

class InspectRecoveryStep(private val repository: RecoveryRepository, private val budgets: RecoveryBudgetPort, private val tokens: RecoveryTokenPort) {
    fun execute(realm: RecoveryRealm, raw: String, ip: String): RecoveryInspection {
        val attempt = budgets.token(ip, tokens.sha256(raw))
        return try {
            val result = if (realm == RecoveryRealm.Unknown) RecoveryInspection.terminal(RecoveryTokenStatus.INVALID_LINK)
                else RecoverySecret.fromWire(raw)?.let { repository.inspect(realm, it) } ?: RecoveryInspection.terminal(RecoveryTokenStatus.INVALID_LINK)
            attempt.finish(result.status == RecoveryTokenStatus.READY)
            result
        } catch (failure: RuntimeException) { attempt.finish(false); throw failure }
    }
}

class CompleteRecoveryStep(
    private val repository: RecoveryRepository, private val budgets: RecoveryBudgetPort,
    private val tokens: RecoveryTokenPort, private val transactions: RecoveryTransactions,
) {
    fun execute(realm: RecoveryRealm, raw: String, rawPassword: String, ip: String): RecoveryCompletionResult {
        val attempt = budgets.token(ip, tokens.sha256(raw))
        return try {
            val password = RecoveryPassword.fromWire(rawPassword) ?: throw RecoveryPasswordRejected()
            val secret = RecoverySecret.fromWire(raw)
            val result = if (realm == RecoveryRealm.Unknown || secret == null) RecoveryCompletionResult.INVALID_LINK
                else transactions.execute { repository.complete(realm, secret, password) }
            attempt.finish(result == RecoveryCompletionResult.COMPLETED)
            result
        } catch (failure: RuntimeException) { attempt.finish(false); throw failure }
    }
}

class RecoveryService(
    private val request: RequestRecoveryStep, private val inspect: InspectRecoveryStep, private val complete: CompleteRecoveryStep,
) : RecoveryUseCases {
    override fun request(realm: RecoveryRealm, email: String, sourceIp: String) = request.execute(realm, email, sourceIp)
    override fun inspect(realm: RecoveryRealm, token: String, sourceIp: String) = inspect.execute(realm, token, sourceIp)
    override fun complete(realm: RecoveryRealm, token: String, password: String, sourceIp: String) = complete.execute(realm, token, password, sourceIp)
}
