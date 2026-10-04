# Security and session policy

- Preserve Argon2id verification, dummy work, generic authentication errors,
  and bounded request size.
- Use one shared logical-attempt budget across the unified endpoint and legacy
  endpoints, keyed by source IP plus canonical-email hash. A unified attempt
  may verify both realms but consumes one budget unit; alternating endpoints
  cannot bypass it. Success clears only the exact key after the attempt and
  never erases the other realm's failure history.
- For rejected or unverified credentials, do not reveal candidate count, realm,
  account existence, or timing details. A selection response may reveal only
  already-verified eligible contexts and never an account identifier. A valid
  CUSTOMER plus an inactive, invalid, or roleless USER yields CUSTOMER only.
- Challenge is opaque, server-side, 120 seconds, single-use, atomically
  consumed, bound to the nonce cookie and exact Origin, and invalidated after
  issuance.
- Revalidate active identity and current USER roles at challenge consumption.
- Keep `__Host-` cookies, CSRF generation, SameSite, origin checks, and realm
  guards unchanged.
- Reject open redirects and never accept subject IDs, roles, or realms as
  authority from the browser.
- Log event metadata only; never credentials, raw session tokens, CSRF values,
  challenge values, or raw email.
