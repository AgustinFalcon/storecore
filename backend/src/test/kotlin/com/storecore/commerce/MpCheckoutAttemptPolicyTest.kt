package com.storecore.commerce

import com.storecore.commerce.domain.*
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

class MpCheckoutAttemptPolicyTest {
    private val orderId = 41L
    private val key = UUID.fromString("b39ea9e9-0c65-4533-8ff3-e0770954ebf8")

    @Test
    fun `reference is deterministic bounded and caller idempotency key is retained on retry`() {
        val reference = MpCheckoutAttemptPolicy.externalReference(orderId, 12)
        assertEquals("SC-$orderId-12", reference)
        assertTrue(reference.length <= 64)
        val first = MpCheckoutAttemptPolicy.propose(input(attemptNo = 1)) as ProposeAttemptDecision.Create
        val retry = MpCheckoutAttemptPolicy.propose(input(attemptNo = 1, existing = listOf(first.attempt)))
        assertEquals(ProposeAttemptDecision.Reuse(first.attempt), retry)
        assertEquals(key, first.attempt.idempotencyKey)
    }

    @Test
    fun `created attempt and financial accreditation block a concurrent proposal`() {
        val created = MpCheckoutAttemptPolicy.propose(input()) as ProposeAttemptDecision.Create
        assertEquals(
            ProposeAttemptDecision.Blocked(AttemptBlockReason.ACTIVE_ATTEMPT_EXISTS),
            MpCheckoutAttemptPolicy.propose(input(attemptNo = 2, existing = listOf(created.attempt))),
        )
        assertEquals(
            ProposeAttemptDecision.Blocked(AttemptBlockReason.FINANCIAL_ACCREDITED),
            MpCheckoutAttemptPolicy.propose(input(attemptNo = 1, existing = listOf(created.attempt), financialAccredited = true)),
        )
    }

    @Test
    fun `contradictory snapshots fail closed before same attempt replay`() {
        val first = snapshot(1, CheckoutAttemptState.CREATED)
        val otherActive = snapshot(2, CheckoutAttemptState.POSTING).copy(
            idempotencyKey = UUID.fromString("f7a6a937-d25e-4f20-90bb-aa148b3c7f5a"),
        )
        assertEquals(
            ProposeAttemptDecision.Invalid("snapshot_contains_multiple_active_attempts"),
            MpCheckoutAttemptPolicy.propose(input(existing = listOf(first, otherActive))),
        )
        assertEquals(
            ProposeAttemptDecision.Invalid("snapshot_contains_duplicate_identity"),
            MpCheckoutAttemptPolicy.propose(input(existing = listOf(first, first.copy(idempotencyKey = otherActive.idempotencyKey)))),
        )
        assertEquals(
            ProposeAttemptDecision.Invalid("snapshot_contains_duplicate_identity"),
            MpCheckoutAttemptPolicy.propose(input(existing = listOf(first, snapshot(2, CheckoutAttemptState.TERMINAL_UNPAID_VERIFIED)))),
        )
    }

    @Test
    fun `replay cannot bypass another active attempt`() {
        val prior = snapshot(1, CheckoutAttemptState.TERMINAL_UNPAID_VERIFIED)
        val active = snapshot(2, CheckoutAttemptState.POSTING).copy(
            idempotencyKey = UUID.fromString("f7a6a937-d25e-4f20-90bb-aa148b3c7f5a"),
        )
        assertEquals(
            ProposeAttemptDecision.Blocked(AttemptBlockReason.ACTIVE_ATTEMPT_EXISTS),
            MpCheckoutAttemptPolicy.propose(input(existing = listOf(prior, active))),
        )
    }

    @Test
    fun `financial accreditation blocks another attempt even when order needs stock review`() {
        assertEquals(
            ProposeAttemptDecision.Blocked(AttemptBlockReason.FINANCIAL_ACCREDITED),
            MpCheckoutAttemptPolicy.propose(input(attemptNo = 2, financialAccredited = true)),
        )
    }

    @Test
    fun `only verified terminal unpaid attempt permits a new proposal with a new key`() {
        val prior = snapshot(1, CheckoutAttemptState.TERMINAL_UNPAID_VERIFIED)
        val newKey = UUID.fromString("f7a6a937-d25e-4f20-90bb-aa148b3c7f5a")
        assertTrue(MpCheckoutAttemptPolicy.propose(input(attemptNo = 2, existing = listOf(prior), idempotencyKey = newKey)) is ProposeAttemptDecision.Create)
        assertEquals(
            ProposeAttemptDecision.Blocked(AttemptBlockReason.IDEMPOTENCY_KEY_ALREADY_USED),
            MpCheckoutAttemptPolicy.propose(input(attemptNo = 2, existing = listOf(prior))),
        )
        for (state in listOf(
            CheckoutAttemptState.CREATED, CheckoutAttemptState.POSTING, CheckoutAttemptState.RECOVERY_REQUIRED,
            CheckoutAttemptState.READY_FOR_REDIRECT, CheckoutAttemptState.AWAITING_RESULT, CheckoutAttemptState.QUARANTINED,
        )) {
            assertEquals(
                ProposeAttemptDecision.Blocked(AttemptBlockReason.ACTIVE_ATTEMPT_EXISTS),
                MpCheckoutAttemptPolicy.propose(input(attemptNo = 2, existing = listOf(snapshot(1, state)))),
            )
        }
    }

    @Test
    fun `ambiguous create outcomes never return a url`() {
        val outcomes = listOf(
            CreationObservation.Timeout,
            CreationObservation.HttpFailure(503),
            CreationObservation.HttpFailure(423),
            CreationObservation.HttpFailure(400, "idempotency_validation_failed"),
            CreationObservation.HttpFailure(409, "idempotency_key_already_used"),
        )
        for (outcome in outcomes) {
            assertTrue(MpCheckoutAttemptPolicy.classifyCreation(outcome) is CreationDecision.Recovery)
        }
        assertEquals(
            CreationDecision.ReadyForRedirect("ORD-1", "https://checkout.example/1"),
            MpCheckoutAttemptPolicy.classifyCreation(CreationObservation.VerifiedSuccess("ORD-1", "https://checkout.example/1")),
        )
        assertEquals(
            CreationDecision.Recovery(RecoveryReason.INVALID_VERIFIED_SUCCESS),
            MpCheckoutAttemptPolicy.classifyCreation(CreationObservation.VerifiedSuccess("ORD-1", " ")),
        )
    }

    @Test
    fun `search binds only a unique exact candidate after valid exhausted search`() {
        val candidate = candidate()
        assertEquals(SearchDecision.Bind("ORD-1"), MpCheckoutAttemptPolicy.evaluateSearch(search(listOf(candidate))))
        assertEquals(
            SearchDecision.Recovery(RecoveryReason.ZERO_CANDIDATES),
            MpCheckoutAttemptPolicy.evaluateSearch(search(emptyList())),
        )
        assertEquals(
            SearchDecision.Recovery(RecoveryReason.MULTIPLE_CANDIDATES),
            MpCheckoutAttemptPolicy.evaluateSearch(search(listOf(candidate, candidate.copy(providerOrderId = "ORD-2")))),
        )
    }

    @Test
    fun `incomplete pagination invalid window and every identity mismatch require recovery`() {
        assertEquals(
            SearchDecision.Recovery(RecoveryReason.SEARCH_INCOMPLETE),
            MpCheckoutAttemptPolicy.evaluateSearch(search(listOf(candidate()), pagesExhausted = false)),
        )
        assertEquals(
            SearchDecision.Recovery(RecoveryReason.SEARCH_INCOMPLETE),
            MpCheckoutAttemptPolicy.evaluateSearch(search(listOf(candidate()), pagesFetched = 3, maxPages = 2)),
        )
        assertEquals(
            SearchDecision.Recovery(RecoveryReason.INVALID_SEARCH_WINDOW),
            MpCheckoutAttemptPolicy.evaluateSearch(search(listOf(candidate()), windowFrom = createdAt.plusSeconds(1))),
        )
        assertEquals(
            SearchDecision.Recovery(RecoveryReason.INVALID_SEARCH_WINDOW),
            MpCheckoutAttemptPolicy.evaluateSearch(
                search(listOf(candidate())).copy(
                    window = SearchWindow(createdAt.minusSeconds(30), createdAt.minusSeconds(1), createdAt.minusSeconds(10)),
                ),
            ),
        )
        assertEquals(
            SearchDecision.Recovery(RecoveryReason.INVALID_SEARCH_WINDOW),
            MpCheckoutAttemptPolicy.evaluateSearch(
                search(listOf(candidate())).copy(
                    window = SearchWindow(createdAt.minusSeconds(30), queriedAt.plusSeconds(30), createdAt.minusSeconds(31)),
                ),
            ),
        )
        val mismatches = listOf(
            candidate().copy(externalReference = "other"),
            candidate().copy(merchantId = "other-merchant"),
            candidate().copy(applicationId = "other-app"),
            candidate().copy(amount = BigDecimal("100.01")),
            candidate().copy(currency = "USD"),
        )
        for (mismatch in mismatches) {
            assertEquals(
                SearchDecision.Recovery(RecoveryReason.CANDIDATE_MISMATCH),
                MpCheckoutAttemptPolicy.evaluateSearch(search(listOf(mismatch))),
            )
        }
    }

    @Test
    fun `bind same id replays and different id conflicts`() {
        assertEquals(BindDecision.Bind("ORD-1"), MpCheckoutAttemptPolicy.bind(null, "ORD-1"))
        assertEquals(BindDecision.Replay("ORD-1"), MpCheckoutAttemptPolicy.bind("ORD-1", "ORD-1"))
        assertEquals(BindDecision.Conflict("ORD-1", "ORD-2"), MpCheckoutAttemptPolicy.bind("ORD-1", "ORD-2"))
    }

    private fun input(
        attemptNo: Int = 1,
        existing: List<CheckoutAttemptSnapshot> = emptyList(),
        financialAccredited: Boolean = false,
        idempotencyKey: UUID = key,
    ) = ProposeAttemptInput(orderId, attemptNo, idempotencyKey, existing, financialAccredited)

    private fun snapshot(attemptNo: Int, state: CheckoutAttemptState) = CheckoutAttemptSnapshot(
        orderId, attemptNo, MpCheckoutAttemptPolicy.externalReference(orderId, attemptNo), key, state,
    )

    private val createdAt = Instant.parse("2026-09-22T12:00:00Z")
    private val queriedAt = createdAt.plusSeconds(60)
    private val expected = ExpectedOrderIdentity("SC-$orderId-1", "merchant-1", "application-1", BigDecimal("100.00"), "ARS")

    private fun candidate() = RemoteOrderCandidate(
        "ORD-1", expected.externalReference, expected.merchantId, expected.applicationId, BigDecimal("100.00"), "ARS",
    )

    private fun search(
        candidates: List<RemoteOrderCandidate>,
        pagesFetched: Int = 1,
        pagesExhausted: Boolean = true,
        maxPages: Int = 5,
        windowFrom: Instant = createdAt.minusSeconds(30),
    ) = SearchEvaluationInput(
        attemptCreatedAt = createdAt,
        window = SearchWindow(windowFrom, queriedAt.plusSeconds(30), queriedAt),
        limits = SearchLimits(Duration.ofMinutes(5), maxPages),
        pagesFetched = pagesFetched,
        pagesExhausted = pagesExhausted,
        candidates = candidates,
        expected = expected,
    )
}
