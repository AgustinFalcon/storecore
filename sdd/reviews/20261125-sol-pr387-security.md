VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane. This review did not read `sdd/reviews/20261125-sol-pr387-architecture.md`.
- PR: 387 OPEN `feat(media): attest PID 1 PrivateTmp on the worker unit` https://github.com/AgustinFalcon/storecore/pull/387
- branch: `feat/media-broker-4c-private-tmp-20261125`
- head SHA: `733a6aeec08d58e5756d2c950bddc03ffcf91579` (`gh pr view 387` `headRefOid`; `git rev-parse HEAD`; one commit, message `feat(media): attest PID 1 PrivateTmp on the worker unit`)
- base SHA / `origin/master` / `baseRefOid`: `a8992dbdbcc5658a60a4cf11eb22d82ab321baa7` (`git rev-parse origin/master`)
- `gh pr view 387`: OPEN, base `master`, 3 files, +96 / −5
- `git diff --stat origin/master...HEAD`: 3 files, 96 insertions, 5 deletions. `git diff --check origin/master...HEAD`: clean (exit 0, no output)
- `git diff --name-only`: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`. `plan.md` is not in the diff.
- Verify: run `45574676365` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `733a6aeec08d58e5756d2c950bddc03ffcf91579`). 7/7 success. None cancelled. `gh pr checks 387` reports the same seven jobs `pass`.
- `plan.md` still has `- [ ]` on TASK-005 (line 16), `003B-4B-3`, `003B-4B-4`, and `MEDIA-NORMALIZE-003B-4C` (line 89).
- this file is not a GitHub approval, does not close a checkbox, and does not rewrite the PR body
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45574676365)

Seven jobs, all `completed` / `success` on `733a6aeec08d58e5756d2c950bddc03ffcf91579`. None cancelled:

- repository-hygiene: success (`139069543567`)
- backend: success (`139069654945`)
- media-broker: success (`139069655022`)
- media-broker-pid1: success (`139069654972`)
- frontend: success (`139069654928`)
- productive-routes-real-e2e: success (`139069654848`)
- unified-access-real-e2e: success (`139069654904`)

`media-broker-pid1` log: `dbus::tests::pid1_worker_private_tmp ... ok`. `test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 64 filtered out`.

`media-broker` log: `dbus::tests::derived_worker_private_tmp ... ok`. `test result: ok. 64 passed; 0 failed; 17 ignored`.

The PR body still leaves the hosted Verify box and the dual-review box unchecked, and it still says not to mark `003B-4C` / TASK-005 / HTTP closed. The run above is the evidence. This review does not check those boxes.

## Why this cut

ADR-001 keeps `Ready` behind attested Linux isolation, including namespaces, no `AF_INET`/`AF_INET6`, and `CPUQuota`. Technical spec `003B-4C` is the real UID A/UID B harness (SELF_TEST/NORMALIZE, per-job and global quota, terminals without ACK, FD/mmap after seal, OOM/timeout, cgroup termination, substitution rejection, restart). The PR title and body say this slice only derives `PrivateTmp=true` inside `worker_properties`, that the client does not supply it, that PID 1 reads the effective property, and that `CPUQuota` and `RestrictAddressFamilies` stay unset. `003B-4C` stays open: socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready stay out. No media HTTP.

`sdd/STATUS.md` and progress say the same thing. `plan.md` is untouched and `MEDIA-NORMALIZE-003B-4C` is still `[ ]`. The diff does not claim the gate closed.

## Diff reviewed

`worker_properties` appends `("PrivateTmp", Value::from(true))` after the existing `PrivateNetwork=true`. The bool is a literal in that function. It is not read from `TransientUnits`, `BrokerRequest`, or the D-Bus call. `StartTransientUnit` still sends only `(name, "fail", properties, empty auxiliary)`. `properties()` still chooses `worker_properties` for `UnitKind::Worker` and rejects `UnitKind::Unknown`.

`BrokerRequest` is still operation, job id, revision, digest, and size. `TransientUnits::derive` still takes job id, mount root, principal, and approved runtime, and its contract still says callers cannot supply unit names, `Where`, or `ExecStart`. There is no property bag a client can use to set or clear `PrivateTmp`.

The new unit test `derived_worker_private_tmp` asserts the key `PrivateTmp` is present and that `RestrictAddressFamilies` and `CPUQuota` are absent. The value check is `Debug` text containing `true`. The binding attest is the PID 1 test: root, `/proc/1/comm` == `systemd`, derived transient mount and worker, then `systemctl show -p PrivateTmp --value` equals `yes` or `true`. `systemctl` stays on the test path. The daemon start path is still `StartTransientUnit`.

`NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths` = the job workspace, and `TMPDIR` = that workspace stay in the same vector. The workspace path used by the harness is under `/run/storecore_media/jobs`, not `/tmp`. `PrivateTmp` gives the unit a private `/tmp` and `/var/tmp`. It does not replace the job tmpfs, `LimitFSIZE`, or a global quota.

The diff contains no `AF_INET`, `AF_INET6`, or `RestrictAddressFamilies` assignment. `PrivateNetwork=true` was already on the unit and is a network namespace, not an address-family filter. This cut does not remove `AF_INET`/`AF_INET6`. `CPUQuota` is not inserted. The unit test fails the build if either key appears in the derived vector.

Docs match the code. STATUS says this cut does not close `003B-4C`, that `CPUQuota` and `RestrictAddressFamilies` stay out, and that socket family, global quota, terminals without ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, and `Ready` are still absent. It says there is no media HTTP. Progress says the same and does not mark `003B-4C`.

No secret, token, private key, credential, or live-provider URL is in the diff. No Kotlin capability factory, no HTTP route, no workflow, no migration.

Untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`, `20261125-sol-pr384-*.md`, `20261125-sol-pr386-*.md`) are outside this three-dot diff and were not staged.

## Controls

- `PrivateTmp=true` is derived inside `worker_properties`. The client cannot supply it.
- `CPUQuota` and `RestrictAddressFamilies` stay unset on the property vector that PID 1 receives. `PrivateTmp` does not replace either control and is not an `AF_INET`/`AF_INET6` removal.
- The PID 1 harness reads the effective `PrivateTmp` back as `yes` or `true` (`pid1_worker_private_tmp` ok, 17 passed).
- Surface does not unblock capability, return `Ready`, or add media HTTP. `003B-4C` stays open.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4C` stays open. Still out: `RestrictAddressFamilies` (no `AF_INET`/`AF_INET6` removal), cgroup `CPUQuota`, global quota, ACK, FD/mmap after seal, restart on every durable transition, remaining RLIMIT, Ready, and media HTTP. `PrivateTmp` does not replace `RestrictAddressFamilies` or `CPUQuota`. The private `/tmp` tmpfs is not a job or global byte quota.
- `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005, and #7 stay open. The capability stays blocked. This review does not check off any of those.
- The unit-test `contains("true")` check is loose. The binding attest is the PID 1 read of `yes` or `true`. That read does not also show `RestrictAddressFamilies` or `CPUQuota` empty on the live unit. Absence of those keys is proven on the derived property vector. systemd does not add them when they are omitted. Default address families stay allowed, and the default CPU quota stays unset.
- The PID 1 test treats a non-`Err` start as enough to read the property. It does not require `UnitState::Active` or a completed SELF_TEST. That matches the stated cut: attest the effective property, and do not claim `Ready`.
- The PR body still has the Verify box and the dual-review box unchecked. Hosted Verify `45574676365` is already 7/7. This file does not edit that body.
- This file is not a GitHub approval and must stay untracked.
