# Evidence Index

## Root Baseline

- Status: initialized as a local Git repository on master.
- Root commit scope: .gitignore, GOVERNANCE.md, EVIDENCE-INDEX.md only.
- Existing workspace material: excluded from version control until audited.

## Redaction Rules

Do not add values or files containing secrets, credentials, private network details, personal data, operational access procedures, dumps, local-only artifacts or environment files.

## Pending Audit

- Review inherited documentation and classify each file as safe, sensitive, obsolete or requires redaction.
- Create an explicit allowlist before staging any inherited file.
- Record validation evidence without exposing sensitive values.

## Falcon Monitoring Readiness - 2026-07-25

Status: planned/no-code product readiness only. The repo contains governance/docs/SDD material and no buildable backend, frontend, mobile app, Dockerfile, Maven/Gradle/npm project, or runtime entrypoint. Shared-service StoreCore mail/notification contracts do not prove a StoreCore runtime implementation here. Do not add Monitoring code until a Git-backed implementation repo and supported SDK target exist. Keep Falcon credentials, tenant/project/environment identifiers, and ingestion endpoints out of source/docs.
