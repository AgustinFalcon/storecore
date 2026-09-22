# Source Classification

## Current Classification

- Source: StoreCore baseline SDD, audited locally on 2026-09-21.
- Maturity: pre-coding documentation; no runtime or deployment artifact.
- Sensitivity policy: deny-by-default remains for any file outside the explicit local allowlist.
- Allowlisted baseline material: `AGENTS.md`, `README.md`, `GOVERNANCE.md`, `SOURCE-CLASSIFICATION.md`, `EVIDENCE-INDEX.md`, `sdd/**` and `docs/agent/**` after redaction review.

## Evidence Boundary

The allowlisted corpus was reviewed for secrets, credentials, private hosts, personal data and actionable access procedures. Runtime runbooks, environments, dumps and any operational document remain excluded until independently redacted and classified.

## Promotion Criteria

A file or claim can move into version control or Knowledge only when it has a named source/maturity, no sensitive content, clear ownership and shareable validation evidence. The allowlist authorizes local staging only; it does not authorize a commit, tag, push or GitHub Release.