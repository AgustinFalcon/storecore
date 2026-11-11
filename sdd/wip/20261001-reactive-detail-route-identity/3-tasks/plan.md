# Implementation plan — issue #142

1. RDI-001: make four detail containers react to route identity and clean up.
2. RDI-002: scope fulfillment responses and commands to the current generation.
3. RDI-003: clear tracking on identity change and disable busy controls.
4. RDI-004: test actual router reuse, duplicate query changes, retry, forged
   payment query parameters, superseded GET and mutation outcomes.
5. RDI-005: record local checks and limitations; obtain required reviews and
   hosted checks before any integration.

RDI-001–003 are implemented on current master. RDI-004 has local runtime,
TypeScript, lint, architecture and production-build evidence. RDI-005 closed on
2026-11-11 with two independent GPT-6.1 Sol approvals and hosted Verify
`43086417458` 3/3 on candidate `4c560f5`. The documentation-only head that
records that result still requires its own exact-head reviews and hosted Verify
before integration. User implementation authorization is recorded in meta.md;
no unexecuted approval is represented as a completed gate.
