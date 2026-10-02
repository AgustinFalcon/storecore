# Integration acceptance

- INT-FE-001: a valid USER repository fixture carries closed UserRole instances, not strings or an empty role collection. Existing sign-in and probe composition tests exercise success with Operator, without relying on ADMIN permissions.
- INT-FE-002: probe still waits for its own CSRF response before marking authenticated; CUSTOMER and USER remain isolated.
- INT-FE-003: composed USER sign-in/probe reject empty or Unknown-only roles, clear prior USER authentication/CSRF, preserve CUSTOMER authentication/CSRF and do not perform USER CSRF retrieval for the invalid probe.
- INT-FE-004: existing composition-root resolution and success/error logout/CSRF tests remain intact. No weakened use-case guards or new role/permission.
