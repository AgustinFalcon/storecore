# PCC-008C bounded SYSTEM lifecycle contract review — 2026-11-25

## Scope

Contract-only gate for bounded internal SYSTEM lifecycle candidate selection and orchestration. This evidence does not approve implementation, a timer, scheduler, background executor, reminder occurrence worker, notification handoff or activation.

## Closed contract

- Added functional requirements PCC-R10T and PCC-R10U.
- Captures one authoritative whole-second cycle instant before any query or lock.
- Selects only exact activation/completion candidates, completes missed windows without synthetic activation and caps each invocation at 100.
- Keeps candidates immutable and derives operation/revision/boundary from a validated observed event snapshot.
- Defines closed selection, advance, receipt-disposition and cycle-result types with an explicit accounting invariant.
- Resolves deterministic binding/replay before evaluating current lifecycle or time.
- Suppresses only an already-audited revision-exhausted identity from later pages so it cannot starve following candidates.
- Registers no public route, timer, scheduler, background invoker or reminder effect.

## Independent review loop

Two independent GPT-6.1 Sol reviewers at medium reasoning initially returned `NO-GO`:

1. both found that the first writer order checked current due-ness before receipt recovery, which would turn a valid replay into `NOT_DUE` after an applied activation/completion;
2. the architecture reviewer found incomplete closed result accounting and a forgeable candidate boundary;
3. the security reviewer found that an unchanged `REVISION_EXHAUSTED` event could permanently occupy the first slot of a size-one page.

The contract was corrected to derive identity from the retained selected snapshot, resolve/recheck binding before current-state validation, distinguish `NEW` from `REPLAY`, classify every SYSTEM outcome, derive boundary internally and suppress only the exact terminal exhausted identity. Both reviewers then found the same editorial counter mismatch; the contract replaced the ambiguous count with the explicit invariant:

`selected = applied + replayed + revisionConflicted + invalidTransition + revisionExhausted + missing + corrupt`.

Final architecture review: `APPROVE`, no P0–P3 findings. Final security/concurrency review: `APPROVE`, no P0–P3 findings. Both approvals are limited to the corrected contract.

## Local documentary checks

- `git diff --check`: pass before commit.
- No production implementation or runtime test is claimed by this contract evidence.
