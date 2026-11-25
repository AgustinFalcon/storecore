VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane; `sdd/reviews/20261125-sol-pr389-architecture.md` was not read
- PR: 389 OPEN `fix(media): leave ProtectHome unset after PID 1 ENXIO` https://github.com/AgustinFalcon/storecore/pull/389
- branch: `feat/media-broker-4c-protect-home-20261125`
- head: `c847ca92a103397ca0c1178df4bdddbbd9f46e02`
- base: `f91d576cedfb83e87b6402b132798ed31d76664a` (`origin/master`)
- `git rev-parse HEAD`, `git rev-parse origin/master`, and `git merge-base origin/master HEAD` match those SHAs
- range reviewed: `f91d576cedfb83e87b6402b132798ed31d76664a...c847ca92a103397ca0c1178df4bdddbbd9f46e02` (commits `cf554af` then `c847ca9`)
- Verify: `45627692228` `pull_request` exact-head 7/7 `completed` / `success`, none cancelled, headSha `c847ca92a103397ca0c1178df4bdddbbd9f46e02`
- `git diff --check` on that range: clean
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45627692228)

headSha `c847ca92a103397ca0c1178df4bdddbbd9f46e02`. Run conclusion `success`. Event `pull_request`. No job cancelled.

- repository-hygiene `139252173112`: `completed` / `success`
- backend `139252316077`: `completed` / `success`
- media-broker `139252316136`: `completed` / `success`
- media-broker-pid1 `139252316157`: `completed` / `success`
- frontend `139252316096`: `completed` / `success`
- productive-routes-real-e2e `139252316162`: `completed` / `success`
- unified-access-real-e2e `139252316120`: `completed` / `success`

`media-broker-pid1` job `139252316157` log: `test dbus::tests::pid1_worker_protect_home ... ok`.

## Prior head

Verify `45624972507` is `pull_request` / `failure` on head `cf554af2a6589feeb775c987ce2a8e26703f2d02`. That commit put `("ProtectHome", Value::from(true))` on `worker_properties` and required PID 1 to report `yes` or `true`. Job `media-broker-pid1` `139242785861` ended `3 passed; 15 failed`. Worker `StartTransientUnit` lines are `System.Error.ENXIO: Failed to set unit properties: Unexpected message contents`. `pid1_worker_protect_home` panicked with `StartTransientUnit rejected derived ProtectHome`. The three passes (`pid1_starts_and_stops_derived_tmpfs_mount`, `pid1_rejects_substituted_runtime_jar`, `pid1_uid_a_process_cannot_traverse_job_tmpfs`) are not successful worker starts. `c847ca9` removes the property. The net three-dot diff does not send it.

## Why this cut

`003B-4C` stays open. `sdd/wip/20261116-catalog-media-upload-and-variant-gallery/3-tasks/plan.md` is outside the diff and still has `- [ ] MEDIA-NORMALIZE-003B-4C` (line 89) and `- [ ] TASK-005` (line 16). `003B-4B-3` and `003B-4B-4` stay `[ ]`. PR body checkboxes for Verify, dual review, and “Do not mark `003B-4C` / TASK-005 / HTTP closed” are still open. `sdd/STATUS.md` and `progress.md` say `ProtectHome` stays out because PID 1 returns `ENXIO` Unexpected message contents, the same class of rejection as `RestrictAddressFamilies` and `CPUQuota`, and that this cut does not close `003B-4C`, Ready, socket family, global quota, ACK, FD/mmap, remaining RLIMIT, or media HTTP.

Leaving `ProtectHome` unset is fail-closed honesty after that ENXIO. It is not a sandbox. Home is not protected.

## Controls

- At head, `worker_properties` ends at `PrivateNetwork=true` and `PrivateTmp=true`. The vector has no `ProtectHome`, `RestrictAddressFamilies`, or `CPUQuota`. `c847ca9` deletes the `ProtectHome=true` line added by `cf554af`. `mount_properties` does not carry `ProtectHome`.
- `ZbusSystemd::start` calls `StartTransientUnit` with `(name, START_MODE, properties, auxiliary)`. `start_transient` loads that vector only from `properties(kind, spec)`, which is `mount_properties` or `worker_properties`. The client does not supply the property list. The net diff does not add a property, an HTTP route, a secret, or a capability flag.
- `derived_worker_protect_home` asserts the derived keys omit `ProtectHome`, `RestrictAddressFamilies`, and `CPUQuota`.
- `pid1_worker_protect_home` is `#[ignore]`, requires `/proc/1/comm` = `systemd` and euid 0, starts the derived mount and worker, and accepts `ProtectHome` only as `no`, `false`, or empty. `yes` and `true` fail the assertion. The message is `PID 1 must not apply ProtectHome`. Empty is a wide corroboration if `systemctl show -p ProtectHome --value` exited 0 with no text; the wire lock is the absent key, and the prior run showed that sending `true` makes `StartTransientUnit` fail closed with ENXIO.
- Existing `ProtectSystem=strict`, `ReadWritePaths` limited to the job workspace, `PrivateNetwork`, `PrivateTmp`, `NoNewPrivileges`, and the RLIMIT entries already on the unit stay in the vector. They are not a substitute for `ProtectHome`. This review does not treat `/home`, `/root`, or `/run/user` as inaccessible.

## Residuals (not findings)

`CPUQuota` and `RestrictAddressFamilies` stay unset. Socket family, global quota, ACK, FD/mmap, remaining RLIMIT, Ready, and media HTTP stay out. `003B-4C`, `003B-4B-3`, `003B-4B-4`, `003B-4`, TASK-005, and #7 stay open. Home directories are not protected by this cut.

## Findings

No P0. No P1. No P2. No P3.
