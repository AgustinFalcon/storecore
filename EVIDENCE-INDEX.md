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