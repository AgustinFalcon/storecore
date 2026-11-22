VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- PR: 338 `feat(media): attest PID 1 SELF_TEST input as backend UID A`
- head SHA: `df37702e74c7047f26ec6988522a88ae28115b88`
- base SHA: `63d286f8ff41509f61cfca3bb09d185d7711b30f` (`origin/master`)
- Verify: `44969344387` 7/7 success, none cancelled
- head SHA of the run matches this review

## Job conclusions

`gh run view 44969344387`: conclusion `success`, event `pull_request`, status `completed`, head `df37702e74c7047f26ec6988522a88ae28115b88`. Seven jobs, each conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137045464408`)
- media-broker: success (`137045515299`)
- media-broker-pid1: success (`137045515211`)
- backend: success (`137045515247`)
- productive-routes-real-e2e: success (`137045515245`)
- unified-access-real-e2e: success (`137045515274`)
- frontend: success (`137045515233`)

## Why this cut

`MEDIA-NORMALIZE-003B-4C` in `plan.md` is still `[ ]`. ADR-001 and the technical spec still require a real Linux harness with backend UID A and worker UID B as distinct principals, `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup/mount/quota attestation. The same UID, a mock, or a direct `java -jar` does not close the gate.

This SHA does not close that gate. `82895ad` chowns the PID 1 `SELF_TEST` `request.bin` to 2101:2102 and attests `st_uid == 2101`. `df37702` is the STATUS-only follow-up: the banner now says `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 siguen abiertos, and that this cut adds no HTTP. `dbus.rs` is unchanged between those two commits. The harness `geteuid` stays 0. A chown stamp is not a process running as UID A.

## Implementation

`git diff origin/master...HEAD` is three files (+33/−3): `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and the WIP `progress.md`.

Re-read of `pid1_starts_worker_self_test_on_derived_tmpfs`:

- The ignored test still requires `/proc/1/comm` `systemd` and `geteuid == 0`. It does not call `seteuid` / `setuid`.
- `Principal::create(2102, 2102)` is still the only worker principal passed to `TransientUnits::derive`.
- `write_self_test_request` creates `request.bin` with `create_new` and mode `0o640`, writes the golden `SELF_TEST` vector, then `chown` to `Some(2101)` and `Some(worker.gid())` (2102).
- `assert_request_owned_by_backend` opens that path `RDONLY | NOFOLLOW` and `fstat`s `st_uid == 2101`. It does not claim `st_gid` or `st_mode`.
- `wait_for_worker_result` is unchanged: `result.bin` is opened `RDONLY | NOFOLLOW` and must be non-empty with `st_uid` equal to the worker uid 2102. `output.bin` must be absent.
- `approved_pid1_runtime` still opens Java and the jar through `ApprovedRuntime::open(..., 0, ...)`, which requires a regular file, owner 0, `nlink == 1`, and mode `0555` / `0444`, via `NOFOLLOW`.
- The Verify job still installs that runtime under `/usr/lib/storecore-media-runtime` as `root:root`, directories `0555`, `java` `0555`, jar `0444`. It still appends NSS groups whose names are `2101` and `2102` (gid 2101 and 2102) and creates `storecore-backend` / `storecore-worker` with those numeric ids. `worker_properties` still sets `User` and `Group` from `uid().to_string()` / `gid().to_string()`, so the unit requests `2102`, not a client string.
- `ExecStart` remains the approved `java -jar` pair. `ProtectSystem` remains the internal literal `strict`. `ReadWritePaths` and `TMPDIR` remain the derived `Where`. Mount options stay `nosuid,nodev,noexec,...mode=03770,uid=0,gid=<worker>`. Callers still do not supply `ExecStart`, `Where`, or the property bag.
- The diff has no `store_id`, no tenant host map, no catalog HTTP, no secret, and no `Ready`.

## Findings

No P0. No P1. No P2. No P3.

`df37702` does not change the harness. The STATUS wording no longer says TASK-005 and HTTP permanecen cerrados; it lists those gates as still open and says this cut adds no HTTP. That does not close `003B-4C`.

## Residuals

UID A as a process stays open: the harness chowns `request.bin` while `geteuid` is 0. It does not drop to 2101, and it does not prove a backend principal wrote the input. `NORMALIZE`, cgroup/quota, and isolation between jobs stay open. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. This file is not a GitHub approval and does not mark `003B-4C` closed.
