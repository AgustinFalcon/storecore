# Security and session policy

- Preserve Argon2id verification, dummy work, generic authentication errors,
  and bounded request size.
- Use a shared login-attempt budget across the unified endpoint and legacy
  endpoints; do not permit realm alternation to bypass rate limits.
- Do not reveal candidate count, realm, account existence, or timing details.
- Challenge is opaque, server-side, 120 seconds, single-use, atomic consume,
  bound to the browser risk context, and invalidated after issuance.
- Revalidate active identity and current USER roles at challenge consumption.
- Keep `__Host-` cookies, CSRF generation, SameSite, origin checks, and realm
  guards unchanged.
- Reject open redirects and never accept subject IDs, roles, or realms as
  authority from the browser.
- Log event metadata only; never credentials, raw session tokens, CSRF values,
  challenge values, or raw email.
