# Repository secret hygiene

Status: approved_for_pr.

Issue: #2 residual confirmed during the 2026-11-14 open-issue audit.
Base: `master` `39463f03876a60dbe94beff3bc2377a3bd479cda`.

This cut prevents new environment files, private keys, credential containers and
database dumps from entering the StoreCore repository, adds a deterministic CI
gate, and updates the stale repository-governance description. It does not
rewrite Git history, rotate credentials, inspect provider accounts or claim a
complete secret-scanning service.
