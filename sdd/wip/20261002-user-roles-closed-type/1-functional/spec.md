# Functional spec — closed internal roles

Existing permissions remain ADMIN and OPERATOR. Persisted/HTTP values outside
that exact set decode to a fixed Unknown case, never a role supplied by raw text.

- AC-ROLE-1: exact ADMIN and OPERATOR wires retain their existing identities.
  Case variants, padding, CUSTOMER and unknown codes are Unknown.
- AC-ROLE-2: empty or Unknown-only role sets cannot issue an internal session,
  authenticate as USER, establish request identity or authorize capability reads
  and writes.
- AC-ROLE-3: mixed role sets carry only the known role's permissions. OPERATOR
  plus Unknown cannot satisfy ADMIN checks.
- AC-ROLE-4: frontend session roles are closed UserRole instances with a fixed
  Unknown label. Sign-in/session probe cannot mark Unknown-only or empty roles
  as authenticated.
- AC-ROLE-5: role translation occurs at the database/HTTP edge; domain, usecases,
  stores and views consume the closed type. No raw unknown label is rendered.

No new role, permission, privilege, cookie, endpoint or database schema.
