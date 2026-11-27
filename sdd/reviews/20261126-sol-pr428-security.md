VERDICT: APPROVED

## Evidence identity

- provider: OpenAI
- model: gpt-5.6-sol-medium
- effort: medium
- lane: security
- independent of the architecture lane; no PR #428 architecture review or
  architecture-lane draft was read
- PR: #428, `feat(media): attest PID 1 snapshot survives held source FD mutations`
- branch: `feat/media-broker-4c-fd-after-seal-20261126`
- head SHA: `b800c659b315d76317374fb77fcf62dcf9bdd560`
- PR base SHA: `fd523ee2b3280c891d34a1f0e1b7f01df5139272`
- exact review range:
  `fd523ee2b3280c891d34a1f0e1b7f01df5139272...b800c659b315d76317374fb77fcf62dcf9bdd560`
- diff identity: 5 files, +138/-10
- files: `backend/media-broker/src/dbus.rs`,
  `backend/media-broker/tests/snapshot.rs`, `sdd/STATUS.md`, WIP
  `progress.md`, WIP `meta.md`
- `git diff --check` on the exact three-dot range: clean
- Verify: `45909048066`, `completed` / `success`, headSha
  `b800c659b315d76317374fb77fcf62dcf9bdd560`
- this file is not a GitHub approval and does not close `003B-4C`

## Hosted Verify

All 7 jobs completed successfully:

- repository-hygiene `140212697403`
- media-broker `140212767024`
- media-broker-pid1 `140212767028`
- backend `140212766946`
- frontend `140212766937`
- productive-routes-real-e2e `140212767037`
- unified-access-real-e2e `140212767040`

Focused exact-head evidence:

- `media-broker`: `snapshot_survives_source_growth_and_truncation_on_the_held_fd
  ... ok`; the snapshot integration suite passed 5/5.
- `media-broker-pid1`:
  `pid1_snapshot_survives_held_source_fd_mutations ... ok`; the PID 1 suite
  passed 34 tests with 0 failures.

## Why this cut

The PR body, STATUS rationale, and ADR-001 agree on the narrow property under
review. `SealInput` does not attempt to revoke an already-open backend FD by
changing the source inode's mode or owner. Instead, `copy_snapshot` creates a
distinct destination inode with `CREATE_EXCL`; later overwrite, growth, and
truncation through the still-open source FD must not alter that snapshot.

This cut does not claim mmap coverage, restart/reconciliation coverage at every
durable transition, socket-family attestation, `Ready`, completion of
`003B-4C`, or HTTP media.

## Security review

- The PID 1 regression keeps the writable origin `File` open after sealing,
  copies it into the job tmpfs, mutates the same held FD by overwrite, growth,
  and truncation, and then proves the snapshot still contains the original
  bytes.
- The ordinary Linux regression independently exercises the same held-FD
  overwrite/grow/truncate sequence. Existing snapshot coverage also proves
  exact bytes, expected size and digest, and destination mode `0400`.
- The production snapshot path is unchanged: it duplicates the received
  source FD with `CLOEXEC`, validates a regular-file fingerprint, copies with
  bounded positional reads, probes for growth, verifies SHA-256, synchronizes,
  rechecks source metadata, and removes a partial destination on failure.
- The destination remains a new `create_new(true)` inode opened as `0400`.
  Nothing in this cut applies `chmod` or `chown` to the backend source inode,
  so it does not misrepresent source-FD revocation as sealing.
- Source and destination are distinct inodes; mutations made after
  `copy_snapshot` returns cannot alias the tmpfs snapshot. The source FD remains
  live through all three mutation operations in both new tests.
- No client-supplied D-Bus property, unit name, path, command, or argument is
  added. The D-Bus production property set is unchanged.
- The crate retains `#![forbid(unsafe_code)]`; this diff adds no `unsafe` and no
  mmap behavior.
- No HTTP route, multipart wiring, secret, credential, live-provider behavior,
  deploy, tag, or publish behavior is introduced.
- Existing restart, reconciliation, socket-family, cgroup, RLIMIT, mount,
  process-identity, runtime-digest, and admission controls remain unchanged and
  open where STATUS says they are open.
- The SDD edits accurately keep `003B-4C`, `003B-4`, TASK-005, `Ready`, mmap,
  restart coverage, socket-family attestation, and HTTP media open.

## Open residuals

- mmap mutation after sealing
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

APPROVED for exact head `b800c659b315d76317374fb77fcf62dcf9bdd560`
over PR base `fd523ee2b3280c891d34a1f0e1b7f01df5139272`. Verify
`45909048066` is independently confirmed 7/7 on that head, including the
focused held-FD snapshot tests in both the regular Linux and PID 1 jobs. This
is not a GitHub approval; `003B-4C`, `Ready`, restart, socket-family
attestation, mmap, and HTTP remain open.
