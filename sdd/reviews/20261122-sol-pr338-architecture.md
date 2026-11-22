VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- PR: 338 `feat(media): attest PID 1 SELF_TEST input as backend UID A`
- head SHA: `df37702e74c7047f26ec6988522a88ae28115b88`
- base SHA: `63d286f8ff41509f61cfca3bb09d185d7711b30f` (`origin/master`)
- Verify: `44969344387` 7/7 success, none cancelled (`headSha` `df37702e74c7047f26ec6988522a88ae28115b88`)
- re-review of architecture P3 on `82895ad`

## Job conclusions

- repository-hygiene: success (`137045464408`)
- media-broker: success (`137045515299`)
- media-broker-pid1: success (`137045515211`)
- backend: success (`137045515247`)
- unified-access-real-e2e: success (`137045515274`)
- productive-routes-real-e2e: success (`137045515245`)
- frontend: success (`137045515233`)

`media-broker-pid1` runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_` after creating UID/GID 2101 (`storecore-backend`) and 2102 (`storecore-worker`). That filter includes `pid1_starts_worker_self_test_on_derived_tmpfs`, which now attests `request.bin` uid 2101 and still attests `result.bin` uid 2102.

## Why this cut

`003B-4C` stays `[ ]`. This cut starts the Linux harness slice where PID 1 `SELF_TEST` input `request.bin` is owned by backend UID A (2101) and `result.bin` stays owned by worker UID B (2102). It does not declare `Ready` or catalog HTTP, and it does not close `003B-4C`, `003B-4B-3`, or `003B-4B-4`.

## Focused validation

- `sdd/STATUS.md` banner: `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005 y #7 siguen abiertos. Este corte no agrega HTTP. The `82895ad` wording "TASK-005 y HTTP permanecen cerrados" is gone.
- `plan.md` `MEDIA-NORMALIZE-003B-4C` remains `[ ]`. This review does not check it off.
- Diff has no `Ready` and no catalog media HTTP.
- `request.bin` uid 2101 attestation is in the ignored PID 1 test: create mode `0640`, `chown` to 2101 and the worker gid, then `NOFOLLOW` `fstat` of `st_uid`.

## Implementation

Harness-only change inside `dbus.rs` tests. `write_self_test_request` takes the backend uid and `chown`s `request.bin` to `2101` plus `worker.gid()` (2102). `assert_request_owned_by_backend` opens that path with `NOFOLLOW` and requires `st_uid == 2101` before `start_transient(UnitKind::Worker)`. The worker unit is still `Principal::create(2102, 2102)` from `TransientUnits::derive`. `wait_for_worker_result` still requires `result.bin` uid 2102. Client still cannot supply `ExecStart`, `Where`, or unit properties. No daemon, adapter, or HTTP production path changes.

## Findings

No P0. No P1. No P2. No P3.

The architecture P3 on `82895ad` is fixed on this SHA. The banner now says TASK-005 and #7 siguen abiertos, and that this cut adds no HTTP.

## Residuals

`003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. This cut does not close `003B-4C`. Still absent: `NORMALIZE`, cgroup/quota, job isolation, a backend process running as UID A (the root harness `chown`s the input), substitution rejection, and `Ready`. This file is not a GitHub approval.
