VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261126-sol-pr413-architecture.md` was not read
- PR: 413 OPEN `feat(media): attest PID 1 LimitDATA on the worker unit` https://github.com/AgustinFalcon/storecore/pull/413
- branch: `feat/media-broker-4c-limit-data-20261126`
- head: `af49a66c6a2237f0dda7a7f5983a9d36f1de185a`
- base: `88586bab44c1075b7770248e5c70dcda2f476b47` (`origin/master`)
- `git rev-parse HEAD`, `git rev-parse origin/master`, `git merge-base HEAD origin/master`, and `gh pr view 413` (`headRefOid` / `baseRefOid`) match those SHAs
- review range: `88586bab44c1075b7770248e5c70dcda2f476b47...af49a66c6a2237f0dda7a7f5983a9d36f1de185a` (one commit `af49a66`, three files, +117/−13)
- files: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`
- Verify: `45839402157` `pull_request`, attempt 2, headSha `af49a66c6a2237f0dda7a7f5983a9d36f1de185a`, current conclusion `success`, 7/7 `completed` / `success`, none cancelled
- superseded evidence is not this conclusion: attempt 1 of `45839402157` is the Temurin SemVer miss on the Java jobs. This review uses attempt 2 on `af49a66` only (32× heap). The pid1 log on this head has no `core-dump`
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45839402157)

Current run conclusion `success`. Event `pull_request`. Attempt 2. No job cancelled. Seven jobs, each `completed` / `success`:

- repository-hygiene `139981755671`: `completed` / `success`
- media-broker `139981815906`: `completed` / `success`
- unified-access-real-e2e `139981753302`: `completed` / `success`
- productive-routes-real-e2e `139981753283`: `completed` / `success`
- frontend `139981757438`: `completed` / `success`
- backend `139981753333`: `completed` / `success`
- media-broker-pid1 `139981752902`: `completed` / `success` (14:37:17Z–15:01:55Z, 24m38s)

`media-broker-pid1` job `139981752902` log contains `test dbus::tests::pid1_worker_limit_data ... ok` and `test result: ok. 30 passed; 0 failed; 0 ignored; 0 measured; 77 filtered out`. That log has zero `ENXIO` lines and zero `core-dump` lines. `StartTransientUnit` accepted the derived `LimitDATA` property. The job still runs the existing `Pin Temurin 21.0.13+9` step (`pinned java runtime 21.0.13+9-LTS`); this cut does not retarget that pin. `.github/workflows/verify.yml` is not in the three-dot diff.

`media-broker` job `139981815906` log contains `test dbus::tests::derived_worker_limit_data_is_rlimit_not_as ... ok` and `test result: ok. 77 passed; 0 failed; 30 ignored; 0 measured; 0 filtered out`.

Attempt 1 of the same run is not the reviewed conclusion. Conclusion `failure`, same headSha. The four Java jobs failed in `setup-java` with `No matching version found for SemVer '21.0.13+9'` (Temurin catalog lists `21.0.13+9.0.LTS`): `media-broker-pid1` `139976873330`, `backend` `139976873248`, `unified-access-real-e2e` `139976873067`, `productive-routes-real-e2e` `139976873182`. `repository-hygiene`, `frontend`, and `media-broker` succeeded on attempt 1. The rerun is attempt 2. The workflow pin stayed `21.0.13+9`. That flake is not a sandbox or pin change in this diff.

This head sets `LimitDATA` to the same byte ceiling as `LimitAS` (`32 * WORKER_MEMORY_MAX_BYTES`, `6442450944` bytes). `MemoryMax` stays `192 * 1024 * 1024`. The pid1 log does not show `core-dump`.

This review did not run `cargo` or the PID 1 harness on the Windows host. `git diff --check` on the three-dot range printed no whitespace errors. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` still has `- [ ] TASK-005` (line 16) and `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and is not in the diff. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” stay open.

## Why this cut

PR body, `sdd/STATUS.md`, progress, and ADR-001 say the harness derives one more RLIMIT and PID 1 reads it back. ADR-001 still requires effective RLIMIT attestation before `003B-4C` can close, and it says no `003B-4B` sub-cut enables `Ready` by itself. The spec residual still requires a real UID A/UID B harness (SELF_TEST/NORMALIZE, per-job and global quota, terminals without ACK, FD/mmap after the seal, OOM/timeout, cgroup termination, substitution rejection, restart on every durable transition). The diff does not check off `003B-4C`, Ready, TASK-005, or HTTP.

`ProtectHome`, `CPUQuota`, and `RestrictAddressFamilies` stay unset. An earlier cut recorded PID 1 `StartTransientUnit` `ENXIO` / unexpected message contents for that class of property. This cut does not put them back.

## Security ledger

- `WORKER_LIMIT_DATA` is `WORKER_LIMIT_AS`, which is `32 * WORKER_MEMORY_MAX_BYTES` (`6442450944` bytes). `worker_properties` appends `("LimitDATA", Value::from(WORKER_LIMIT_DATA))` beside the unchanged `("LimitAS", Value::from(WORKER_LIMIT_AS))` and `("MemoryMax", Value::from(WORKER_MEMORY_MAX_BYTES))`. The two rlimits share one byte ceiling and are different properties: `LimitDATA` is `RLIMIT_DATA`; `LimitAS` is `RLIMIT_AS`. `LimitDATA` is not `LimitAS` and it is not `MemoryMax`. `MemoryMax` remains the cgroup RSS cap of 192 MiB. The data-segment ceiling does not raise the address-space ceiling and does not replace it.
- The byte ceiling is a literal in `worker_properties`. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` stays a fixed frame (operation, 16-byte job id, revision, 32-byte digest, size) with no property map. The client cannot supply `LimitDATA`.
- `StartTransientUnit` receives that derived vector and an empty auxiliary array. `properties` loads the worker vector only from `worker_properties`. Keys are `'static`. There is no client property bag.
- The PID 1 check reads the effective property back (`systemctl show -p LimitDATA`). It accepts the derived decimal or the soft:hard form that starts with that decimal, the same predicate already used for `LimitAS`, `LimitCPU`, and `LimitFSIZE`. Job id `[0x20; 16]` is not reused by another PID 1 test. The harness then stops the worker and the mount. It does not open HTTP, inject a client property, or mark the broker `Ready`. The readback is the unit property, not `getrlimit` inside the JVM.
- `derived_worker_limit_data_is_rlimit_not_as` requires `LimitDATA` and `LimitAS`, requires `LimitDATA` to exceed `MemoryMax`, and requires the property list to omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`. The full `worker_properties` vector still does not set those three. It also does not set `PrivateUsers`, `MemoryDenyWriteExecute`, or `LimitSTACK`.
- `pid1_worker_limit_data` is `#[cfg(test)]` and `#[ignore]`, and it requires `/proc/1/comm` = `systemd` and euid 0. On this head that test passed under PID 1.
- The three-dot diff is `dbus.rs`, `sdd/STATUS.md`, and the WIP progress note. No secrets, no media HTTP route, no Kotlin capability flag, no `CPUQuota`, no socket-family allowlist, and no Java pin change.

## Gaps

`003B-4C` stays open. So do socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT (`LimitSTACK`), `ProtectHome`, `CPUQuota`, `RestrictAddressFamilies`, `PrivateUsers`, `MemoryDenyWriteExecute`, `Ready`, and media HTTP. `LimitDATA` does not close those residuals. The PID 1 check does not call `getrlimit` in the worker. STATUS names this cut and keeps `003B-4C` open. `plan.md` leaves `003B-4C` and TASK-005 unchecked. This review does not check them off.

## Findings

No P0. No P1. No P2. No P3.

## Verdict

APPROVED for head `af49a66c6a2237f0dda7a7f5983a9d36f1de185a`. Verify attempt 2 `45839402157` is 7/7 on that head. `003B-4C` stays open.
