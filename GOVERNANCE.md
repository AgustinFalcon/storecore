# StoreCore Governance

## Classification

- Source type: product-documentation
- Sensitivity: standard
- Git policy: local repository only; no remote, push or PR from this initialization.
- Branch policy: master holds only the audited root governance baseline. Follow-up work happens on a branch created from master.

## Versioning Boundary

This repository starts deny-by-default. Pre-existing files and directories are not versioned by this root commit. They require explicit review, redaction and allowlist approval before they can be staged.

## Promotion Rules

- Separate evidence from inference.
- Do not commit secrets, credentials, private infrastructure details, personal data, operational runbooks with actionable access details, dumps or environment files.
- Mark maturity explicitly as design, RFC, prototype, predeploy, active operation or deployable product.
- Promote reusable patterns to Knowledge or Company Brain only after evidence is validated and redacted.

## Current Summary

StoreCore pre-coding product documentation workspace.