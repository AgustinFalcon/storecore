VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: architecture
- PR: 340 `feat(media): run PID 1 worker NORMALIZE with UID A input`
- head SHA: `9bd0063e2ce0296afb2fbf5de162752c61f9e197`
- base SHA: `369e75a37d3a6e92e38e5cb0c9ad9f02b89225fb` (`origin/master`, merge of #337)
- Verify: `44972840444` 7/7 success, none cancelled (`headSha` `9bd0063e2ce0296afb2fbf5de162752c61f9e197`)
- re-review after merging `origin/master` #337 (ferreteria demo). Previous architecture review was on `d7e8872a5f18268230a8ffc5d7bcda360c401b8e`.

## Job conclusions

`gh run view 44972840444`: conclusion `success`, event `pull_request`, status `completed`, head `9bd0063e2ce0296afb2fbf5de162752c61f9e197`. Seven jobs, each conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137056153722`)
- media-broker-pid1: success (`137056201356`)
- backend: success (`137056201360`)
- media-broker: success (`137056201379`)
- frontend: success (`137056201388`)
- unified-access-real-e2e: success (`137056201392`)
- productive-routes-real-e2e: success (`137056201424`)

`media-broker-pid1` still runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_` after creating UID/GID 2101 (`storecore-backend`) and 2102 (`storecore-worker`). That filter includes `pid1_starts_worker_normalize_on_derived_tmpfs` and the existing `pid1_starts_worker_self_test_on_derived_tmpfs`. The non-ignored `media-broker` job compiles and runs `normalize_request_frame_matches_worker_v1_layout`.

## Why this cut

`003B-4C` stays `[ ]`. ADR-001 and the technical spec still require a real Linux harness with distinct backend UID A and worker UID B, both `SELF_TEST` and `NORMALIZE` inside the unit, and effective cgroup/mount/quota, job isolation, failure, and restart attestation. A mock, the same UID, or a direct `java -jar` does not close the gate.

This cut is the `NORMALIZE` half only. PID 1 writes `input.bin` and `request.bin` owned by UID A (2101) and attests `output.bin` and Accepted `result.bin` owned by UID B (2102). It does not declare `Ready` or catalog HTTP, and it does not close `003B-4C`, `003B-4B-3`, or `003B-4B-4`.

Merging #337 does not change that scope. The ferreteria demo is already on `origin/master`. The only extra line it brings onto this branch is `STORECORE_SHOWCASE_DATASET_FILE` in the productive-routes e2e job. That line is not in `origin/master...HEAD`.

## Focused validation

- `sdd/STATUS.md` banner: this cut does not close `003B-4C`. It records `input.bin`/`request.bin` uid 2101 and Accepted `output.bin`/`result.bin` uid 2102, and it still lists cgroup/quota, job isolation, a UID A process, and `Ready` as absent. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 siguen abiertos. Este corte no agrega HTTP. The banner is unchanged from `d7e8872`.
- `plan.md` `MEDIA-NORMALIZE-003B-4C` remains `[ ]` (SELF_TEST/NORMALIZE inside the unit, plus cgroup/mount/quota and job isolation). This review does not check it off. `plan.md` is not in the diff.
- `progress.md` records the PID 1 NORMALIZE start and says `003B-4C` is not marked. No cgroup, UID A process, `Ready`, or HTTP.
- `git diff origin/master...HEAD` (`369e75a...9bd0063`) is the same three paths as the previous review (+216/−18): `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and WIP `progress.md`. No `Ready`. No catalog media HTTP. No ferreteria files.
- The `dbus.rs` patch hash against this base matches the patch reviewed on `d7e8872` (`76deb1ef825ab8e911251146cc79863202415ea6`). `dbus.rs`, `STATUS.md`, and `progress.md` are identical between those two heads.
- New test `pid1_starts_worker_normalize_on_derived_tmpfs` is `#[ignore]`. `normalize_request_frame_matches_worker_v1_layout` is not ignored.
- No cgroup, quota, job-isolation, or UID A process code. `geteuid` stays 0; the root harness `chown`s the inputs.

## Implementation

Harness-only change inside `dbus.rs` tests. `write_normalize_workspace` reads the worker golden `input-jpeg.jpg`, writes `input.bin` and a V1 `NORMALIZE` `request.bin` with `create_new` mode `0640`, and `chown`s both to 2101 and `worker.gid()` (2102). `assert_input_owned_by_backend` and `assert_request_owned_by_backend` open those paths with `NOFOLLOW` and require `st_uid == 2101` before `start_transient(UnitKind::Worker)`.

`encode_normalize_request` follows the worker codec field order: magic `SCMW`, REQUEST, 176-byte payload, V1, operation `NORMALIZE`, profile `IMAGE_IO_V1`, SHA-256 of the input, and `MediaNormalizationLimits.standard()` (10/20 MiB, 320–6000 px, 16 MP, heap 192 MiB, workspace 48 MiB, 12 s, concurrency 1, 64 KiB diagnostics, 1024 segments, 1 MiB metadata). The non-ignored layout test pins magic, REQUEST, length 176, V1, `NORMALIZE`, and frame length 188. Cross-language acceptance is the ignored PID 1 test, which Verify ran on this head.

The worker unit is still `Principal::create(2102, 2102)` from `TransientUnits::derive`. `wait_for_worker_result` polls up to 60 s for this test (SELF_TEST stays 30 s) and requires `result.bin` uid 2102. `assert_accepted_normalize_artifacts` requires `output.bin` uid 2102 and size > 0, and a RESPONSE frame whose payload status byte is `ACCEPTED`. Client still cannot supply `ExecStart`, `Where`, or unit properties. No daemon, adapter, or HTTP production path changes.

The Accepted check reads the status byte at the worker frame boundary. It does not introduce a second Rust closed type. That matches the existing SELF_TEST golden in this module. The Kotlin enums remain the worker-side closed types.

## Findings

No P0. No P1. No P2. No P3.

## Residuals

`003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. This cut does not close `003B-4C`. Still absent: cgroup/quota, job isolation, substitution rejection, restart recovery, and a backend process running as UID A (the root harness `chown`s the input). `Ready` and HTTP stay out. `SELF_TEST` inside the same derived unit remains the previous slice. This file is not a GitHub approval and does not mark `003B-4C` closed.
