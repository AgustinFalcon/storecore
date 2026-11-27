VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: architecture
- independent of the security lane; this review did not read the PR #428
  security-lane file.
- PR: #428 OPEN, `feat(media): attest PID 1 snapshot survives held source FD mutations`
- URL: https://github.com/AgustinFalcon/storecore/pull/428
- branch: `feat/media-broker-4c-fd-after-seal-20261126`
- base branch: `master`
- head SHA: `b800c659b315d76317374fb77fcf62dcf9bdd560`
- base SHA: `fd523ee2b3280c891d34a1f0e1b7f01df5139272`
- exact range:
  `fd523ee2b3280c891d34a1f0e1b7f01df5139272...b800c659b315d76317374fb77fcf62dcf9bdd560`
- diff identity: 5 files, 138 insertions, 10 deletions; the full three-dot
  diff was read.
- commits: `d8c09e32f77dab2798ef3a4d05a0387586e489a3`,
  `e2ec9629cc37b9b23ef08b6e76151d3551b8c716`, and
  `b800c659b315d76317374fb77fcf62dcf9bdd560`.
- checkout HEAD was the exact PR head.
- `git diff --check` on the exact range exited 0 with no output.
- this file is not a GitHub approval, does not merge or retarget PR #428, and
  does not close `003B-4C`, inspect Ready/HTTP, or retarget Java.

## PR intent and SDD why

`gh pr view 428` reports the expected base/head and a narrow 4C evidence cut:
prove that the broker snapshot remains immutable after the backend retains and
mutates the source FD. mmap remains explicitly deferred.

The current STATUS establishes the same sequencing: FD-of-origin evidence after
seal is this cut; mmap and restart at every durable transition are next.
ADR-001 requires `SealInput` to copy the received regular FD into a new,
broker-owned inode and requires the Linux harness to retain both FD and mmap of
the origin while proving later mutations cannot alter the worker-visible
snapshot. This PR intentionally covers only the FD half of that requirement.

`3-tasks/plan.md` remains outside the diff and
`MEDIA-NORMALIZE-003B-4C` remains `[ ]`. STATUS, progress, and meta likewise
keep 4C, `Ready`, socket-family evidence, and media HTTP open.

## Hosted Verify and focused validations

Verify `45909048066` is a completed `pull_request` run with conclusion
`success` on exact head
`b800c659b315d76317374fb77fcf62dcf9bdd560`. All 7 jobs succeeded:

- repository-hygiene `140212697403`
- media-broker `140212767024`
- media-broker-pid1 `140212767028`
- backend `140212766946`
- frontend `140212766937`
- productive-routes-real-e2e `140212767037`
- unified-access-real-e2e `140212767040`

The exact `media-broker-pid1` log records:
`pid1_snapshot_survives_held_source_fd_mutations ... ok`.
The focused non-PID-1 integration test
`snapshot_survives_source_growth_and_truncation_on_the_held_fd` is included in
the successful `media-broker` gate. The exact-range whitespace validation also
passed.

## Architecture review

The implementation and tests preserve the approved boundary:

- `copy_snapshot` duplicates the received FD as `CLOEXEC`, validates a regular
  file and its expected size, and opens the destination with `create_new`.
  The destination is therefore a separately created inode, not a chmod/chown
  publication of the source inode.
- The PID 1 test creates the destination beneath the active per-job tmpfs mount,
  while the held source file remains beneath the broker journal fixture. It
  copies and verifies the expected digest before mutating the still-open source
  FD.
- Mutation uses that same held `File`: overwrite from offset zero, growth to
  twice the original length, and truncation to four bytes. After all mutations
  and `sync_all`, the tmpfs snapshot still equals the original sealed bytes;
  the recorded snapshot size and digest also remain the expected values.
- The ordinary integration test repeats the held-FD growth/truncation proof
  without requiring PID 1, while the hosted PID 1 test proves the actual tmpfs
  placement and lifecycle path.
- The broker crate has both `#![forbid(unsafe_code)]` and
  `unsafe_code = "forbid"`. No mmap implementation or mmap dependency/reference
  exists in this cut. The docs correctly defer the mmap-origin proof instead of
  claiming it from FD-only evidence.
- No domain/application contract, wire protocol, dependency, migration,
  endpoint, Java target, or capability/Ready behavior changes. Production
  snapshot behavior is unchanged; this cut adds evidence for the already
  approved snapshot architecture.

The test does not exercise every intermediate mutation as an independently
published checkpoint, but the final truncation would also expose any shared
inode, and `create_new` plus the retained-source mutation sequence directly
establishes the intended independence. No architecture gap follows.

## P0-P3

- P0: none
- P1: none
- P2: none
- P3: none

## Conclusion

PR #428 provides honest, exact-head evidence that `copy_snapshot` publishes a
new tmpfs inode whose bytes remain unchanged after overwrite, growth, and
truncation through the held source FD. mmap remains outside this cut and
`003B-4C` correctly stays open. Architecture verdict: APPROVED with no P0-P3.
