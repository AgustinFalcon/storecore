VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (authorized substitute; no quota)
- lane: security
- PR: 340 `feat(media): run PID 1 worker NORMALIZE with UID A input`
- head SHA: `9bd0063e2ce0296afb2fbf5de162752c61f9e197`
- base SHA: `369e75a37d3a6e92e38e5cb0c9ad9f02b89225fb` (`origin/master`; merge-base is this SHA)
- Verify: `44972840444` 7/7 success, none cancelled
- head SHA of the run matches this review
- independent of the architecture lane; this file is not a GitHub approval and does not mark `003B-4C` closed

Re-review after `9bd0063` merged `origin/master` (`369e75a`, PR #337 ferreteria demo) into the branch. `git diff origin/master...HEAD` is still three files, +216/−18. The demo commits are on the base and are not part of this delta. `backend/media-broker/src/dbus.rs` remains `b4a38db..26be64f`.

## Job conclusions

`gh run view 44972840444`: conclusion `success`, event `pull_request`, status `completed`, head `9bd0063e2ce0296afb2fbf5de162752c61f9e197`. Seven jobs, each conclusion `success`, none `cancelled`:

- repository-hygiene: success (`137056153722`)
- media-broker-pid1: success (`137056201356`)
- backend: success (`137056201360`)
- media-broker: success (`137056201379`)
- frontend: success (`137056201388`)
- unified-access-real-e2e: success (`137056201392`)
- productive-routes-real-e2e: success (`137056201424`)

Job `137056201356` log: `cargo test --locked --all-targets -- --ignored --test-threads=1 pid1_` reported `pid1_starts_worker_normalize_on_derived_tmpfs ... ok`, plus the existing mount and `SELF_TEST` PID 1 tests. That cargo invocation finished `3 passed; 0 failed; 0 ignored`.

## Why this cut

ADR-001 and `plan.md` require `003B-4C` to show real UID A and UID B, with `SELF_TEST` and `NORMALIZE` inside the derived unit. A direct `java -jar`, a mock of `systemctl`, or one shared UID does not close that gate. This PR starts `NORMALIZE` through PID 1 on the derived tmpfs, with `input.bin` and `request.bin` owned by 2101 and `output.bin` / `result.bin` owned by 2102. `plan.md` is not in the diff. At this SHA `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`.

## Focused validation

Production `properties()`, `StartTransientUnit`, `TransientUnits::derive`, and `ApprovedRuntime::open` are outside the diff. The Rust change is `#[cfg(test)]` in `backend/media-broker/src/dbus.rs`. The other two files are `sdd/STATUS.md` and the WIP `progress.md`.

Checked on this diff:

- `write_backend_owned` creates the file with `create_new` and mode `0o640`, then `chown` to `2101` and `worker.gid()` (`Principal::create(2102, 2102)` in the PID 1 test, so group 2102).
- Ownership is read back with `open(NOFOLLOW)` and `fstat` for `request.bin`, `input.bin`, `output.bin`, and `result.bin` (`wait_for_worker_result` requires `result.bin` uid `worker.uid()`, which is 2102).
- `input.bin` is `include_bytes!` of the worker golden JPEG. The request digest is SHA-256 of that same slice.
- `encode_normalize_request` matches worker V1: magic `SCMW`, REQUEST `1`, payload length 176, version `1`, operation `NORMALIZE` `1`. `assert_accepted_normalize_artifacts` requires `output.bin` uid 2102 and size > 0, and `result.bin` magic `SCMW`, frame kind `2` (RESPONSE), and payload byte `1` (ACCEPTED).
- The PID 1 test asserts `geteuid() == 0` before it writes. There is no `seteuid` / `setuid` to 2101. File uid 2101 is a root `chown` stamp, not a backend process running as UID A.
- `worker_properties` still sets `ProtectSystem` to the literal `strict`. This PR does not add a property argument. Callers still cannot pass unit names, `Where`, or `ExecStart`. The harness root is the fixed `/run/storecore_media/jobs`.
- The diff contains no HTTP route, secret, token, `Ready`, or `store_id`. STATUS and progress say this cut adds no HTTP and does not declare `Ready`.

`003B-4C` stays open in `plan.md`, STATUS, and progress. The ledger calls the owners file uids and says there is still no cgroup/quota, no job isolation, and no UID A process.

## Findings

No P0. No P1. No P2. No P3.

Merging PR #337 did not change the media-broker delta. The harness does not treat a root `chown` as a UID A process, and it does not check off `003B-4C`. The worker still runs as UID B 2102, which is not UID A.

## Residuals

UID A as a process stays open: the harness `geteuid` remains 0, and 2101 is only the owner stamped on `input.bin` and `request.bin`. cgroup/quota stays open. Isolation between jobs stays open. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No HTTP and no `Ready`. This file is not a GitHub approval and does not mark `003B-4C` closed.
