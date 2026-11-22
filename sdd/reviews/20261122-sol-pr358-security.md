VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- independent of the architecture lane
- PR: 358 OPEN https://github.com/AgustinFalcon/storecore/pull/358
- head: `cda8f48d34482af7becb25910520186d90091411`
- base: `8a2ca296f2198f5a918738385e01248c04ff71ba` (`origin/master`)
- `git rev-parse HEAD` and `git rev-parse origin/master` match those SHAs
- Verify: `45000735868` exact-head 7/7 `completed` / `success`, none cancelled
- this file is not a GitHub approval
- this review does not close `003B-4C`, does not mark Ready, and does not add HTTP

## Job conclusions (Verify 45000735868)

headSha `cda8f48d34482af7becb25910520186d90091411`. Run conclusion `success`. No job cancelled.

- repository-hygiene `137141490282`: `completed` / `success`
- backend `137141536489`: `completed` / `success`
- media-broker `137141536512`: `completed` / `success`
- media-broker-pid1 `137141536525`: `completed` / `success`
- frontend `137141536528`: `completed` / `success`
- productive-routes-real-e2e `137141536475`: `completed` / `success`
- unified-access-real-e2e `137141536485`: `completed` / `success`

`media-broker-pid1` runs `cargo test --locked --ignored --test-threads=1 pid1_`, which includes `pid1_worker_runtime_max_stops_frozen_mainpid`.

## Why this cut

`003B-4C` stays open in `plan.md` (`[ ]`). STATUS and progress describe an internal 12s runtime ceiling and a 1s stop grace, attested by freezing the worker MainPID. The diff does not check off `003B-4C`, Ready, or HTTP. OOM, cgroup teardown, and `CPUQuota` stay out of this cut.

## Controls

- `WORKER_RUNTIME_MAX_USEC` (`12_000_000`) and `WORKER_TIMEOUT_STOP_USEC` (`1_000_000`) are private constants. `worker_properties` puts them on `RuntimeMaxUSec` and `TimeoutStopUSec`. `TransientUnits::derive` still takes only job id, mount root, principal, and approved runtime. `BrokerRequest` is a fixed 72-byte frame with no property map, so the client cannot supply either value.
- `StartTransientUnit` receives only that derived vector. The PID 1 harness reads `RuntimeMaxUSec` back and accepts the microsecond constant or systemd's `12s` display.
- The harness is `#[cfg(test)]` and `#[ignore]`, requires euid 0 and PID 1 `systemd`, SIGSTOPs the derived unit's `MainPID` only when that pid is non-empty and not `0`, then waits for the PID 1 journal (`Reached runtime time limit` / timeout result) inside 20s. `result.bin` must be absent. `kill` is not on the daemon start path.
- `MediaWorkerJobFiles.readBounded` requires `Files.isRegularFile` with `NOFOLLOW_LINKS` before `newByteChannel`. A FIFO fails that require. `MediaNormalizerWorkerMain.run` maps the failure to `UNKNOWN_EXIT` (2) and does not write `result.bin`, so a FIFO `request.bin` does not block the worker open.
- `RemainAfterExit` stays true. The timeout attest refuses to proceed without a live MainPID. An exited worker left Active is the existing self-test path, which stops the unit itself; RuntimeMax is not treated as cleanup of a process that has already gone. That is why the harness freezes a live pid.

## Residuals (not findings)

OOM, cgroup kill, `CPUQuota`, `Ready`, HTTP, secrets, and the `003B-4C` checkbox remain open. Timeout bounds a live worker. It does not replace an explicit stop after a normal exit.

## Findings

No P0. No P1. No P2. No P3.
