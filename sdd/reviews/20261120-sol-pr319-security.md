VERDICT: APPROVED

# PR 319 — security review

## Evidence identity

- provider: Cursor
- model: grok-4.7-medium-fast
- effort: medium
- substitute-for: gpt-5.6-sol-medium because Sol usage limit
- user-authorized: yes
- lane: security
- PR: 319 (merged)
- head SHA: `9e77bcf8de7b2a874d0998cd43435f999050f85b`
- merge SHA: `381296d6e267d4c2813345f3bb635ad927a1aff5`
- base SHA: `444afd374e00c1416eeb72bbf412e184cfdfec0b`
- workspace HEAD at review: `9e77bcf8de7b2a874d0998cd43435f999050f85b`
- tree delta `9e77bcf`..`381296d`: empty
- Verify run: `44837144576`
- Verify on head `9e77bcf`: SUCCESS 6/6 (`repository-hygiene`, `backend`, `media-broker`, `frontend`, `productive-routes-real-e2e`, `unified-access-real-e2e`)
- post-merge run: `44838436904`
- post-merge status: `in_progress` on `381296d` (not a pass). At review time `repository-hygiene`, `media-broker`, `frontend`, `productive-routes-real-e2e`, and `unified-access-real-e2e` were success; `backend` was still in progress. No cancelled job is counted as a pass.
- stale review: any APPROVED note for `4a10f15b8164d978f5f74e18a7c374e1f2cab1fa` is stale and is not evidence for this head.

## Scope and validation

Read the PR title and body, the 003B-4B-2 progress rationale (orphan RAM-only block, `RecoveryPending` after adapter effects, and latch-after-terminate crash), and the full `444afd3...9e77bcf` diff (7 files, +2832/−0) before judging the implementation. Local tests were not re-run; the head evidence is Verify `44837144576`.

This lane covers the durable broker state cut only. It does not accredit `003B-4B` aggregate, `003B-4B-3`, `003B-4B-4`, `003B-4C`, TASK-005, or issue #7.

## Security assessment

- The journal opens the private root with `O_NOFOLLOW` and keeps one non-blocking exclusive `flock` on that directory fd for the life of the `Journal`. A second store or a competing process gets `LockUnavailable`. Record and gate reads use `NONBLOCK | NOFOLLOW`; a FIFO with a valid `.job` name is rejected as a non-regular file without a blocking open. New files use `O_EXCL | O_NOFOLLOW`, owner/mode/`nlink == 1` checks, file fsync, rename, and directory fsync. Unknown names, crash `*.tmp` residue, checksum, version, reserved bytes, and filename/job mismatch fail closed.
- Job records and `admission.blocked` use SHA-256 over a fixed payload. `DurableBlockReason::from_wire` maps anything other than 1, 2, or 3 to `Unknown`, and both `latch_block` and `read_gate` reject `Unknown`. There is no unlink of `admission.blocked`; no normal path clears the latch.
- Public `transition` requires `AdmissionStatus::Open`, the bound principal, the bound boot-id, and the current revision. Stale revisions do not mutate. Invalid edges, `Unknown`, bad timestamps, and revision exhaustion call `block_durably` before returning. `transition_reconciled` stays `pub(crate)` and runs only while `RecoveryPending`.
- `BrokerStore::open` always starts at `RecoveryPending`, including when a latch is already loaded. `allocate` and public `transition` stay closed until a clean `finish_reconciliation`. `reconcile` calls `require_recovery_pending` before `enumerate`.
- Every mismatch calls `persist_intervention` while the store is still `RecoveryPending`, and only then may terminate or quarantine. If the latch cannot be created, the adapter is not asked to terminate. A crash at the terminate boundary leaves `admission.blocked` on disk, so a later empty inventory stays blocked. Expected restart termination of a known running job is the clean path and is not pre-latched; if that process dies after the runtime effect, the job record remains and an absent observation becomes a mismatch that latches before further effects.
- Budgets use checked arithmetic. Terminal work without ACK keeps its reservation. Quarantine uses a separate byte/inode pool and still closes admission.
- The diff adds no `Ready` capability, root daemon, mount, D-Bus, `SCM_RIGHTS`, Spring wiring, or privilege change. `lib.rs` still forbids `unsafe`.

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Residuals (not findings)

The runtime adapter is trusted to report a complete inventory and to return `Unknown` or `Unavailable` instead of omitting a unit. A same-uid holder of the journal directory can recompute SHA-256; the checksum detects corruption under the owner-only directory, and it is not a MAC against that owner. Cross-UID handoff, the real daemon, mounts, and `Ready` remain outside this cut.
