VERDICT: CHANGES_REQUIRED

# Corrective architecture/security review — PR #415

- Provider: OpenAI
- Model: GPT-6.1 Sol
- Effort: medium
- Review timing: corrective post-merge; this is not a pre-merge approval
- Requested base SHA: `31222a00e8a6cca3d6e3ec1b4a366822141a4f66`
- Feature head SHA: `3f1bdf0d586a157d93e3983bcb79b2be372fdcc4`
- Merge commit: `52922f5edd043d73563bba43467dab58613fbab9`

## Finding

P2 — the commercial-calendar runner checked the capability only when enabling
its local reminder switch. A later capability transition to
`DISABLED|READ_ONLY|PAUSED|ERROR`, or a new kill for
`EMIT_IN_APP_CAMPAIGN_REMINDER`, could leave that switch effective and allow a
new claim or not-yet-emitted handoff.

The action is a write-capable `PUBLISH`. `CapabilityActor.System` correctly
rejects it globally; the repair must not invent ADMIN authority or broaden
SYSTEM permissions. The required fix is a narrow runtime-admission contract,
revalidated under a lock order compatible with capability administration,
immediately before claim and handoff effects. Unknown evidence must fail
closed.

## Validation recorded by the reviewer

- calendar Node validation: 13/13 passed;
- focused Maven validation: 46 tests passed;
- PR #415 hosted CI: seven jobs passed, noting the pull-request synthetic
  merge checkout distinction documented in the close-out evidence.

Remediation is owned by PR #417 and requires a new exact-head dual review.
