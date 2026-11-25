VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane (this review did not read `sdd/reviews/20261125-sol-pr383-architecture.md`)
- PR: 383 OPEN `feat(media): attest PID 1 LimitFSIZE on the worker unit` https://github.com/AgustinFalcon/storecore/pull/383
- branch: `feat/media-broker-4c-limit-fsize-20261125` (worktree already on this branch; no checkout)
- head SHA: `d7f773a5a88c7cc71c901433276a7a3e9910ef04` (`git rev-parse HEAD` and `gh pr view 383` `headRefOid`)
- base / `origin/master`: `65a73c385e017ede84b7d97dedd1a300d789fb3b` (`git rev-parse origin/master` and `gh` `baseRefOid`)
- one commit: `d7f773a5a88c7cc71c901433276a7a3e9910ef04` `feat(media): attest PID 1 LimitFSIZE on the worker unit`
- diff identity: `git diff --name-only origin/master...HEAD` is three paths, +91 / −11; `git diff --check origin/master...HEAD` exit 0
- `gh pr view 383`: `OPEN`, base `master`, head `feat/media-broker-4c-limit-fsize-20261125`
- untracked persist-of-persist leftovers (`sdd/reviews/20261124-sol-pr365-*.md`, `20261124-sol-pr373-*.md`, `20261125-sol-pr376-*.md`, `20261125-sol-pr378-*.md`, `20261125-sol-pr380-*.md`, `20261125-sol-pr382-*.md`) are outside this three-dot diff and were not staged
- this file is not a GitHub approval, does not close `003B-4C`, and must stay untracked

## Job conclusions (Verify 45560675895)

`gh pr checks 383` and `gh run view 45560675895`: event `pull_request`, name `Verify`, status `completed`, conclusion `success`, headSha `d7f773a5a88c7cc71c901433276a7a3e9910ef04`. Seven jobs, all `completed` / `success`. None cancelled.

- repository-hygiene `139023354499`: `completed` / `success`
- backend `139023430002`: `completed` / `success`
- media-broker `139023429700`: `completed` / `success`
- media-broker-pid1 `139023429723`: `completed` / `success`
- frontend `139023429847`: `completed` / `success`
- productive-routes-real-e2e `139023429680`: `completed` / `success`
- unified-access-real-e2e `139023429730`: `completed` / `success`

`media-broker-pid1` log: `test dbus::tests::pid1_worker_limit_fsize ... ok`. The `storecore-media-broker` library target filtered by `pid1_` finished `test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 62 filtered out`. The non-root `media-broker` job left `pid1_worker_limit_fsize` ignored and reported `62 passed; 0 failed; 15 ignored`.

The PR body still leaves the Verify and dual-review checkboxes open. This review records the hosted run and does not edit that body.

## Why this cut

`gh pr view 383` says `LimitFSIZE` is derived inside `worker_properties` to the IMAGE_IO_V1 workspace size (48 MiB), the client does not supply it, PID 1 reads the property back, `RestrictAddressFamilies` and `CPUQuota` stay unset, and `003B-4C` stays open: socket family, global quota, ACK, FD/mmap, remaining RLIMIT, and Ready are still out. No media HTTP.

That matches the technical residual in `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/2-technical/spec.md`: the broker derives limits from a root-owned profile, the client cannot choose commands, paths, or limits, attestation reads effective properties, and only `003B-4A+4B+4C` complete `003B-4`. HTTP stays outside the residual. The functional spec still treats upload validation and capability as product behavior; this diff does not implement that HTTP path.

`sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` is not in the diff. `MEDIA-NORMALIZE-003B-4C` is still `- [ ]`. `003B-4B-3`, `003B-4B-4`, and `TASK-005` stay `- [ ]`.

## Controls

- Three-dot diff: `backend/media-broker/src/dbus.rs`, `sdd/STATUS.md`, and `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/4-implementation/progress.md`. No Kotlin, Angular, workflow, migration, fixture, lockfile, protocol, budget, or mount-option file.
- `WORKER_LIMIT_FSIZE` is `crate::systemd::MOUNT_BYTES` (`48 * 1024 * 1024`). `worker_properties` inserts that constant. It does not read a client field, D-Bus argument, or `TransientUnits` limit. `start_transient` still sends only `properties(kind, spec)`.
- The in-memory test requires the property list to contain `LimitFSIZE` and the decimal workspace ceiling. The same test still asserts `RestrictAddressFamilies` and `CPUQuota` are absent. The property vector does not add either key. `PrivateNetwork=true` stays.
- `pid1_worker_limit_fsize` checks `/proc/1/comm` is `systemd`, runs as root, starts the derived mount and worker through `ZbusSystemd::connect_system`, and reads `systemctl show -p LimitFSIZE --value`. It accepts the exact byte string or the `soft:hard` prefix `50331648:`. A longer integer such as `503316480:` does not match that prefix. CI recorded the test `ok`.
- `tmpfs_options` is unchanged (`size=48M,nr_inodes=1024,...`). Global admission budgets in `budget.rs` / `store.rs` are untouched. `LimitFSIZE` is a per-file RLIMIT at the workspace ceiling. It does not replace the mount `size=` or the global job/mount/quarantine budgets.
- No secret, credential, token, or private key in the diff.
- No media HTTP route, client, or adapter. HTTP appears only as a denial.
- No capability unblock, no `Ready`, no inject-ready, and no `store_id`. STATUS and progress say this cut does not close `003B-4C`, and that socket family, global quota, terminals without ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay out. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open.

## Residuals (not findings)

`003B-4C` stays `[ ]`. Socket family (`RestrictAddressFamilies` still absent), `CPUQuota`, global quota, ACK, FD/mmap after the seal, restart on every durable transition, remaining RLIMIT, and `Ready` stay out. The PID 1 check reads the unit property. It does not sample `/proc/<pid>/limits` after `User=` and does not prove `EFBIG` on a write past 48 MiB. The mount `size=48M` literal and `MOUNT_BYTES` are separate sources that both mean 48 MiB today. One file may still occupy the whole tmpfs; aggregate fill remains the mount quota, and many jobs remain the global admission budgets.

## Findings

No P0. No P1. No P2. No P3. No overclaim that 4C, Ready, HTTP, capability, or inject-ready is closed.

The diff is an honest derived `LimitFSIZE` with a PID 1 property attest, and it leaves `003B-4C` open. `APPROVED` for the security lane. This file is not a GitHub approval and does not close `003B-4C`.
