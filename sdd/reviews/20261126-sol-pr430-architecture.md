VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane (this review did not read the PR #430
  security-lane file).
- PR: #430 OPEN, `feat(media): attest PID 1 snapshot survives held source mmap mutations`
- URL: https://github.com/AgustinFalcon/storecore/pull/430
- branch: `feat/media-broker-4c-mmap-after-seal-20261126`
- base branch: `master`
- head SHA: `695dee9ddbccbe5743646820160ed174063cd7d3`
- base SHA: `800eae4fabc526ced302b6f50b7c14b06fe0729b`
- exact range:
  `800eae4fabc526ced302b6f50b7c14b06fe0729b...695dee9ddbccbe5743646820160ed174063cd7d3`
- diff identity: 6 files, 226 insertions, 12 deletions; the full three-dot
  diff was read.
- commits: `3651139db074d14e7158ff400f7d764c16ca1467` and
  `695dee9ddbccbe5743646820160ed174063cd7d3`.
- checkout HEAD was the exact PR head; fetched `origin/master` was the exact
  base SHA.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #430,
  does not retarget Java, and does not close or check off `003B-4C`.

## PR intent and SDD why

`gh pr view 430` reports the expected OPEN PR and a narrow evidence cut:
after `copy_snapshot`, retain a writable `MAP_SHARED` mapping of the origin
and prove that mmap writes plus later growth and truncation cannot change the
broker-owned snapshot.

The SDD requires a new broker-owned inode because chmod/chown of the received
inode would leave a prior FD or mmap writable. ADR-001 requires the 4C harness
to retain FD/mmap access to the origin and mutate it after seal while the
worker-visible snapshot remains unchanged. The technical spec includes this
among a larger Linux harness gate.

The canonical plan still has `MEDIA-NORMALIZE-003B-4C` as `[ ]`. STATUS,
progress, and meta keep restart at every durable transition, socket-family
evidence, `Ready`, and media HTTP outside this cut. Enabling rustix `mm` is
test support for this attest; it does not complete 4C.

## Hosted Verify and focused validations

Verify run `45916980019` is a completed `pull_request` run with conclusion
`success` on exact head
`695dee9ddbccbe5743646820160ed174063cd7d3`. All 7 jobs succeeded:

- repository-hygiene `140238463791`
- media-broker `140238531772`
- media-broker-pid1 `140238531702`
- backend `140238531765`
- frontend `140238531704`
- productive-routes-real-e2e `140238531701`
- unified-access-real-e2e `140238531717`

The exact `media-broker-pid1` log records
`pid1_snapshot_survives_held_source_mmap_mutations ... ok`, with 1 passed and
0 failed for that integration target. The exact `media-broker` log records
`snapshot_survives_held_source_mmap_mutations ... ok`; the regular snapshot
target completed with 6 passed and 0 failed. The exact-range whitespace check
also passed.

## Architecture review

- Both tests call `copy_snapshot` first and then create a writable
  `MAP_SHARED` mapping of the still-open origin FD. This ordering directly
  proves that even a mapping acquired after publication can mutate the origin
  inode without aliasing the already-created snapshot. The mapping remains
  live through overwrite, `msync`, growth, truncation, and source `sync_all`.
- The PID 1 test derives `JobId [0x27; 16]`, starts the derived `.mount`, and
  places `snapshot.bin` under that active per-job tmpfs. The source remains a
  separate file outside the mount. After all origin mutations, the tmpfs
  snapshot still equals `sealed-media`, and its recorded size and digest remain
  exact.
- `copy_snapshot` remains production-safe code: it duplicates the source
  `CLOEXEC`, requires a regular file and exact initial size, creates the
  destination with `create_new`, copies with bounded `pread`, verifies digest
  and size, synchronizes the new inode, and rejects source fingerprint drift
  during the copy. No production snapshot behavior changes in this PR.
- `src/lib.rs` still declares `#![forbid(unsafe_code)]`. The package lint moves
  from `forbid` to `deny` only so integration-test crates can explicitly allow
  the unsafe mmap calls. Both test crates scope that allowance at crate level
  with a stated mmap-only reason, and each unsafe operation documents its
  pointer/length invariant. Production library code cannot override its
  stronger `forbid`.
- rustix remains pinned at `1.1.6`; this cut only enables its `mm` feature.
  There is no lockfile or production API change. The new syscall surface is
  used only by the integration tests.
- No restart/reconciliation evidence, socket-family attest, capability
  `Ready`, media HTTP, migration, Kotlin/Angular boundary, Java target, wire
  protocol, or production mmap path is added. The documentation accurately
  leaves those residuals open.

Creating the mapping after `copy_snapshot` is sufficient for this narrow
aliasing claim: a shared mapping of the source inode writes that inode, while
the destination created and copied earlier is a distinct inode. The growth and
truncation happen while the mapping is still live, and the final read from the
tmpfs snapshot proves no backing-inode alias exists.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

PR #430 adds exact-head hosted evidence that a writable `MAP_SHARED` mapping
of the origin, retained through overwrite, growth, and truncation after
`copy_snapshot`, cannot alter the separately created tmpfs snapshot. Unsafe
code remains excluded from the production library, and the package lint change
is narrowly justified for integration tests. `003B-4C` correctly remains open
for restart, socket-family, `Ready`, and the rest of the aggregate harness
contract. Architecture verdict: APPROVED with no P0-P3.
