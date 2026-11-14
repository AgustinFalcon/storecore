# Source Classification

## Current Classification

- Source: StoreCore product source, SDD and evidence, continuously reviewed.
- Maturity: active product implementation; provider homologation is tracked separately.
- Sensitivity policy: deny-by-default remains outside the explicit source allowlist, with security exclusions that override allowed product trees.
- Allowlisted product material includes the Kotlin backend, Angular frontend,
  migrations, named test fixtures, SDD and redacted product documentation.

## Evidence Boundary

The tracked corpus is guarded for sensitive paths and high-confidence secret
signatures on every pull request and `master` push. Runtime environments,
private keys, credential containers, dumps and actionable access procedures
remain excluded. The gate does not replace credential rotation or Git-history
incident response.

## Promotion Criteria

A file or claim can move into version control only when it has a named
source/maturity, no sensitive content, clear ownership and shareable validation
evidence. Promotion to `master`, a tag or a release additionally requires its
applicable review and Verify gates.
