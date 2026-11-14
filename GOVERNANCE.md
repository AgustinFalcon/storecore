# StoreCore Governance

## Classification

- Source type: active product source and documentation
- Sensitivity: standard
- Git policy: GitHub remote with protected review, Verify gates and evidence-backed pull requests.
- Branch policy: `master` holds reviewed product increments. Follow-up work happens on a branch created from current `master`.

## Versioning Boundary

The repository remains deny-by-default at its root and explicitly allowlists
product areas. Security exclusions override those allowlists for environment
files, private keys, credential containers, dumps and local databases. The CI
repository-hygiene gate inspects stage-zero Git blobs before application builds.

## Promotion Rules

- Separate evidence from inference.
- Do not commit secrets, credentials, private infrastructure details, personal data, operational runbooks with actionable access details, dumps or environment files.
- Mark maturity explicitly as design, RFC, prototype, predeploy, active operation or deployable product.
- Promote reusable patterns to Knowledge or Company Brain only after evidence is validated and redacted.

## Current Summary

StoreCore active product repository with Kotlin backend, Angular frontend,
PostgreSQL migrations, SDD evidence and GitHub Verify automation. Live provider
credentials and homologation remain outside version control.
