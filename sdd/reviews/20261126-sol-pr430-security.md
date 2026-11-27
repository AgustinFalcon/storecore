VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane (this review did not read the PR #430
  architecture-lane file)
- PR: #430, OPEN, `feat(media): attest PID 1 snapshot survives held source mmap mutations`
- URL: https://github.com/AgustinFalcon/storecore/pull/430
- branch: `feat/media-broker-4c-mmap-after-seal-20261126`
- base: `master`
- head SHA: `695dee9ddbccbe5743646820160ed174063cd7d3`
- base SHA: `800eae4fabc526ced302b6f50b7c14b06fe0729b`
- exact review range:
  `800eae4fabc526ced302b6f50b7c14b06fe0729b...695dee9ddbccbe5743646820160ed174063cd7d3`
- diff identity: 6 files, +226/-12
- files: `backend/media-broker/Cargo.toml`,
  `backend/media-broker/tests/pid1_mmap_after_seal.rs`,
  `backend/media-broker/tests/snapshot.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, WIP `meta.md`
- commits:
  `3651139db074d14e7158ff400f7d764c16ca1467`,
  `695dee9ddbccbe5743646820160ed174063cd7d3`
- `git diff --check` on the exact three-dot range: clean
- Verify: `45916980019`, attempt 1, event `pull_request`, `completed` /
  `success`, headSha `695dee9ddbccbe5743646820160ed174063cd7d3`
- this file is not a GitHub approval and does not close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully on the exact head:

- repository-hygiene `140238463791`
- media-broker `140238531772`
- media-broker-pid1 `140238531702`
- backend `140238531765`
- frontend `140238531704`
- productive-routes-real-e2e `140238531701`
- unified-access-real-e2e `140238531717`

Focused evidence:

- `media-broker` passed 80 regular tests and its snapshot integration suite
  passed 6/6, including
  `snapshot_survives_held_source_mmap_mutations ... ok`.
- `media-broker-pid1` passed its existing 34-test suite and then the dedicated
  ignored harness invocation:
  `pid1_snapshot_survives_held_source_mmap_mutations ... ok`; 1 passed, 0
  failed.
- The broker job also completed format, clippy, dependency-license, CycloneDX
  SBOM, and HIGH/CRITICAL CVE gates successfully with the lockfile.

## Why this cut

The PR body, STATUS, ADR-001, technical spec, plan, progress, and meta agree on
the narrow property under review. `SealInput` copies the backend-controlled
origin into a distinct `CREATE_EXCL` snapshot inode. Keeping a writable
`MAP_SHARED` mapping and FD for the origin must therefore not let later mapped
writes, growth, or truncation modify the snapshot.

The plan still records `MEDIA-NORMALIZE-003B-4C` as `[ ]`. This cut does not
claim restart coverage at every durable transition, socket-family attestation,
`Ready`, completion of `003B-4C`, or media HTTP.

## Security review

- The two added Linux integration regressions map the origin `MAP_SHARED` with
  read/write protection, mutate it through the live mapping, `msync` the mapped
  write, grow and truncate the same held source FD, and then prove the snapshot
  retains the original bytes. The PID 1 test additionally verifies the
  returned snapshot evidence size and digest inside the derived tmpfs mount.
- The fixed PID 1 origin is
  `/run/storecore_media/mmap-origin.bin`, created new with mode `0600`; the
  derived snapshot path remains inside the job mount. The test removes a stale
  origin before creation and removes its origin after the successful
  assertion.
- Every added `unsafe` block is confined to the two integration-test crates and
  has a local `SAFETY` explanation covering mapping provenance, length,
  pointer copy, synchronization, and matching unmap. No production Rust source
  contains `unsafe`, `rustix::mm`, `mmap`, or related mapping types.
- The package lint changes `unsafe_code = "forbid"` to `unsafe_code = "deny"`
  only so the separate integration-test crates can explicitly allow the
  required syscall wrappers. The production library still begins with
  `#![forbid(unsafe_code)]`; a lower-level allow cannot override that crate
  attribute. The crate has no production binary target outside this library.
- Enabling rustix `mm` on the existing production dependency compiles the
  syscall wrappers into the dependency feature set, but production code does
  not call them. The relevant rustix mapping operations require unsafe calls,
  which the production library's `forbid(unsafe_code)` rejects. `Cargo.lock`
  is unchanged.
- The mmap remains live while the mapped write, `msync`, growth, and truncation
  occur. Those operations target the original inode; the snapshot is a
  distinct inode already returned by `copy_snapshot`, so neither page-cache
  sharing nor later source-size changes can alias it.
- The exact diff adds no secret, credential, HTTP route, multipart wiring,
  Java version/pin change, capability activation, or `Ready` result. It does
  not alter production snapshot, D-Bus, runtime, admission, or systemd code.
- STATUS, progress, and meta accurately retain restart, socket-family,
  `ProtectHome`, `RestrictAddressFamilies`, `CPUQuota`, `003B-4B-3`,
  `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, issue #7, `Ready`, and HTTP as
  open residuals.

## Open residuals

- restart/reconciliation at each durable transition
- socket-family attestation and `RestrictAddressFamilies`
- remaining effective hardening gaps including `CPUQuota` and `ProtectHome`
- `003B-4B-3`, `003B-4B-4`, `003B-4C`, `003B-4`, TASK-005, and `Ready`
- media HTTP, multipart, provider live, secrets, deploy, tag, and publish

## Findings

P0: none.

P1: none.

P2: none.

P3: none.

## Verdict

APPROVED for exact head `695dee9ddbccbe5743646820160ed174063cd7d3`
over base `800eae4fabc526ced302b6f50b7c14b06fe0729b`. Verify
`45916980019` is independently confirmed 7/7 on that head, including the
dedicated PID 1 mmap regression. This is not a GitHub approval;
`003B-4C`, restart coverage, socket-family attestation, `Ready`, and HTTP
remain open.
