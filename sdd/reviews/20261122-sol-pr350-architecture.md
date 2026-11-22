VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium
- lane: architecture
- PR: 350 OPEN `feat(media): attest UID A process cannot traverse job tmpfs` https://github.com/AgustinFalcon/storecore/pull/350
- branch: `feat/media-broker-4c-uid-a-20261122`
- head SHA: `3fe28fed07bdbd285341b4861c00eeff69c43152`
- `git rev-parse HEAD`: `3fe28fed07bdbd285341b4861c00eeff69c43152` (matches GitHub `headRefOid`)
- base SHA / `origin/master` / three-dot merge-base: `217593d384571465a59b5950010df40735ab77c1`
- Verify on this head: run `44989524553` (`pull_request`, name `Verify`, status `completed`, conclusion `success`, `headSha` `3fe28fed07bdbd285341b4861c00eeff69c43152`, display title matches this PR). 7/7 success. None cancelled. One Verify run on this SHA. Billing was not an exception on this run.
- local cargo: not run. This host is Windows. Focused validation is the hosted Verify run, including `media-broker` and `media-broker-pid1`, plus the three-dot diff.
- this file is not a GitHub approval and does not mark `003B-4C` closed

## Job conclusions (Verify 44989524553)

Seven jobs, all `completed` / `success` on `3fe28fed07bdbd285341b4861c00eeff69c43152`. None cancelled:

- repository-hygiene: success (`137107320993`)
- frontend: success (`137107358775`)
- backend: success (`137107358779`)
- unified-access-real-e2e: success (`137107358819`)
- media-broker: success (`137107358831`)
- productive-routes-real-e2e: success (`137107358834`)
- media-broker-pid1: success (`137107358865`)

`media-broker-pid1` runs `cargo +1.100.0 test --locked --all-targets -- --ignored --test-threads=1 pid1_` as root after creating uid/gid 2101 and 2102. That is the job that executed `pid1_uid_a_process_cannot_traverse_job_tmpfs`. `media-broker` does not run ignored tests.

## Why this cut

`003B-4C` in `plan.md` on this SHA is still `[ ]` (line 89): harness Linux real con UID A/UID B, SELF_TEST/NORMALIZE dentro de la unidad, attestación efectiva de cgroup v2/mount/quota, aislamiento entre jobs, fallos y reinicios. `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4`, and `TASK-005` stay `[ ]`. `meta.md` estado remains `implementation_in_progress`. The spec still says mocks, a direct jar run, or two processes with the same UID do not close the gate, and that only `003B-4A+4B+4C` can complete `003B-4`. HTTP stays outside.

The in-repo claim is narrower than that gate. The harness stays euid 0, chowns `request.bin` to uid 2101, and spawns a real `setpriv --reuid=2101 --regid=2101 --clear-groups` process. That process cannot search or write the job tmpfs. The productive handoff stays `SCM_RIGHTS`. Commit `242b6784e8832ccadcf6511706da6d0459326ed8` expected `head` to read `request.bin`; PID 1 failed that expectation. Commit `3fe28fed07bdbd285341b4861c00eeff69c43152` asserts `Permission denied`. The tmpfs is `mode=03770,uid=0,gid=<worker>` with worker gid 2102. Mode `03770` is owner rwx, group rwx, other none. A process `2101:2101` with cleared groups is not in group 2102, so POSIX open of `request.bin` fails on directory search. That is the designed workspace, not a path UID A can read.

That scope matches the diff. It does not close `003B-4C`.

## Diff reviewed

`git diff --stat origin/master...HEAD`: 3 files, 125 insertions, 4 deletions. Two commits:

- `242b6784e8832ccadcf6511706da6d0459326ed8` `feat(media): attest UID A process against job tmpfs`
- `3fe28fed07bdbd285341b4861c00eeff69c43152` `fix(media): UID A cannot search the 03770 job tmpfs`

| File | change |
| --- | --- |
| `backend/media-broker/src/dbus.rs` | tests only (+111). No change to `mount_properties`, `worker_properties`, `properties`, or `start_transient` |
| `sdd/STATUS.md` | implementation banner names the UID A `setpriv` denial and leaves `003B-4C` open |
| `sdd/wip/.../4-implementation/progress.md` | same claim; `003B-4C` stays unmarked |

`plan.md` and `meta.md` are not in the diff. No Kotlin, Angular, workflow, migration, fixture, lockfile, HTTP route, or secret.

## Focused validation

- `gh pr view 350`: open, base `master` `217593d384571465a59b5950010df40735ab77c1`, head `3fe28fed07bdbd285341b4861c00eeff69c43152`, two commits, three files, +125/−4. The body says PID 1 stays euid 0, the stamp is uid 2101, a real `setpriv --reuid=2101` process cannot traverse or write the `03770` tmpfs, the productive handoff stays `SCM_RIGHTS`, and the cut does not close `003B-4C`, failure/restart, substitution rejection, `Ready`, or HTTP. The body matches the tree.
- `plan.md` on this SHA still has `- [ ]` on `003B-4B-3`, `003B-4B-4`, `MEDIA-NORMALIZE-003B-4C`, `MEDIA-NORMALIZE-004`, and `TASK-005`. This review does not check any of them.
- `sdd/STATUS.md` banner is `4C proceso UID A`. It says this cut does not close `003B-4C`. It says the harness stays euid 0, places `request.bin` uid 2101, and a real `setpriv --reuid=2101` process cannot traverse or write the `03770` tmpfs. It says the productive handoff remains `SCM_RIGHTS`. It still lacks `CPUQuota`, failure/restart, substitution rejection, and `Ready`. `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and #7 siguen abiertos. Este corte no agrega HTTP.
- `progress.md` records the same euid 0 harness, the same `setpriv` denial, and that `003B-4C` is not marked. No failure/restart, substitution rejection, `Ready`, or HTTP.
- `meta.md` is unchanged. Its latest broker sentence is still PR #348 and says that cut does not close a UID A process. That sentence is the master history, not a claim about this head.

## Implementation

`mount_properties` and `worker_properties` are unchanged. The mount options still come from `tmpfs_options`: `nosuid,nodev,noexec,size=48M,nr_inodes=1024,mode=03770,uid=0,gid=<worker gid>`. `DirectoryMode` is still `0o3770`. The worker `User` and `Group` are still the derived principal, which this test constructs as `Principal::create(2102, 2102)`. The client still has no property bag. `properties` still matches `UnitKind::Mount`, `UnitKind::Worker`, and `UnitKind::Unknown`.

`pid1_uid_a_process_cannot_traverse_job_tmpfs` is ignored unless PID 1 is systemd and the process is root. It asserts `geteuid` is 0 before any `setpriv`. It starts only the mount for `JobId` `[0x66; 16]`, writes `request.bin` through the existing helper (`mode 0640`, then `chown` to uid 2101 and the worker gid 2102), and checks that stamp with the root harness. It does not start the worker unit. `assert_uid_a_process` then runs three children:

- `setpriv --reuid=2101 --regid=2101 --clear-groups -- id -u` must print `2101`.
- the same identity running `head -c 1 request.bin` must fail, and stderr must contain `Permission denied`.
- the same identity running `dd` onto `uid-a-write.bin` must fail, and the root harness must not see that file.

`setpriv` is a child. It does not change the harness euid. The parent remains the process that chowns the stamp and stops the mount. The stop still matches `UnitState::Inactive | UnitState::Failed`. Property names stay inside the broker. No view compares a new status string. `Permission denied` is the OS stderr of the path open, not a new domain state and not a second translator. No production path declares `Ready`. No `store_id` and no shared runtime.

The first commit named the test `pid1_uid_a_process_reads_backend_owned_request` and required `head` to succeed. That treated the `0640` owner-read bit as if UID A could walk the directory. The follow-up is the tree: directory search fails, so the open fails before the file mode matters. Owning `request.bin` does not make the `03770` tmpfs a readable workspace. The worker still receives the job through the inherited unit, and the backend path remains an `SCM_RIGHTS` fd. This test does not pass that fd.

## Standards applied

`sdd/reviews/20261122-sol-pr348-architecture.md`: a two-job `ReadWritePaths` readback does not close `003B-4C`, and a UID A process was still outside that cut. `sdd/reviews/20261121-sol-pr334-architecture.md`: the canonical plan checkbox stays `[ ]` until the gate is actually done. `sdd/reviews/20261121-sol-pr331-architecture.md`: `ReadWritePaths` and `ProtectSystem=strict` stay internal, and the client cannot supply them. Closed unit kinds stay `UnitKind` / `UnitState` with `Unknown`. The spec sentence for `003B-4C` still requires SELF_TEST/NORMALIZE inside the unit, quota, job isolation, failure/restart, and substitution rejection; this diff does not satisfy that sentence. Android architecture standards do not apply: the diff has no ViewModel, UiState, or Kotlin architecture file.

## Findings

No P0. No P1. No P2. No P3.

## Residuals (not findings)

- `003B-4B-3`, `003B-4B-4`, aggregate `003B-4B`, `003B-4C`, `003B-4`, TASK-005, and #7 stay open. No `Ready`, no catalog HTTP, no secrets, no deploy.
- Failure and restart attestation stays out. This harness stops the mount after the denial. It does not kill, restart, or reconcile a failed transition.
- Substitution rejection stays out. Nothing in this diff rejects a replaced jar, path, or unit.
- `CPUQuota` stays out. It is not a plan checkbox. This diff does not add it.
- The harness stays euid 0 by design. `geteuid` is checked on the parent. The UID A identity is the `setpriv` child, not `User=` on a transient unit.
- This case does not start the worker, so it does not pair a UID B `SELF_TEST` success with the UID A denial. The same `media-broker-pid1` command still runs the other `pid1_` tests, which do start the worker. The worker principal in this spec remains 2102.
- The positive `SCM_RIGHTS` handoff is not re-executed here. The attest is the negative half: POSIX open of the path is `Permission denied`.
- `id -u` checks the uid. It does not print gid or the supplementary set. The `Permission denied` result is what shows this child lacked directory search. A process that was uid 2101 and also in group 2102 is outside this attest; `--clear-groups` is what this child uses.
- The write probe requires a failed `dd` and no leftover file, seen by euid 0. It does not require `Permission denied` in stderr. The read probe does. The hosted job reached that read assertion.
- The first commit message still says the child reads `request.bin`. The second commit, the PR body, STATUS, and progress say it cannot. The tree is the authority.
- `meta.md` still ends on #348 and says that cut does not close a UID A process. It does not describe this head. The implementation banner in STATUS does.
- This review file is not a GitHub approval, a merge, or a `Ready` declaration, and it does not mark `003B-4C` closed.

## Conclusion

Head `3fe28fed07bdbd285341b4861c00eeff69c43152` attests a real `setpriv --reuid=2101 --regid=2101 --clear-groups` process against a PID 1 job tmpfs. The harness stays euid 0 and chowns `request.bin` to uid 2101. The child cannot search or write the `03770` directory (`uid=0`, gid 2102), so open of `request.bin` is `Permission denied`. That is the `SCM_RIGHTS` handoff boundary, not a readable workspace. The first commit expected the read to succeed; the follow-up is the tree. Verify `44989524553` is success 7/7 on this SHA, none cancelled. `003B-4C`, `003B-4B-3`, `003B-4B-4`, `TASK-005`, failure/restart, substitution rejection, `CPUQuota`, `Ready`, and HTTP stay open. No P0–P3. `APPROVED` for the architecture lane. This file is not a GitHub approval and does not mark `003B-4C` closed.
