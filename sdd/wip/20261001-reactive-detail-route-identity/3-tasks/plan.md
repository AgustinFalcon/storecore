# Implementation plan — issue #142

1. RDI-001: make four detail containers react to route identity and clean up.
2. RDI-002: scope fulfillment responses and commands to the current generation.
3. RDI-003: clear tracking on identity change and disable busy controls.
4. RDI-004: test actual router reuse, duplicate query changes, retry, forged
   payment query parameters, superseded GET and mutation outcomes.
5. RDI-005: record local checks and limitations; obtain required reviews and
   hosted checks before any integration.

RDI-001–003 implemented locally. RDI-004 tests are authored and compile, but
runtime execution remains pending due to the host filesystem access failure.
RDI-005 remains open for review/hosted gates.
User implementation authorization recorded in meta.md; no unexecuted approval
is represented as a completed gate.
