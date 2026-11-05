# Implementation plan — issue #142

1. RDI-001: make four detail containers react to route identity and clean up.
2. RDI-002: scope fulfillment responses and commands to the current generation.
3. RDI-003: clear tracking on identity change and disable busy controls.
4. RDI-004: test actual router reuse, duplicate query changes, retry, forged
   payment query parameters, superseded GET and mutation outcomes.
5. RDI-005: record local checks and limitations; obtain required reviews and
   hosted checks before any integration.

RDI-001–003 are implemented on current master. RDI-004 has local runtime,
TypeScript, lint, architecture and production-build evidence. RDI-005 remains
open for exact-head re-review, hosted CI and integration.
User implementation authorization recorded in meta.md; no unexecuted approval
is represented as a completed gate.
