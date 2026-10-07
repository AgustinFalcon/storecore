# Security and session policy

- Preserve Argon2id verification, dummy work, generic authentication errors,
  and bounded request size.
- Use per-realm failure counters plus the atomic shared logical-attempt budget
  defined in `implementation-decisions.md`: five credential submissions per
  source IP plus canonical-email hash in fifteen minutes across unified and
  legacy endpoints. A unified attempt consumes one unit before evaluating both
  realms. Success never resets any counter; expiry is time-based only.
- For rejected or unverified credentials, do not reveal candidate count, realm,
  account existence, or timing details. A selection response may reveal only
  already-verified eligible contexts and never an account identifier. A valid
  CUSTOMER plus an inactive, invalid, or roleless USER yields CUSTOMER only.
- Challenge is opaque, server-side, 120 seconds, single-use, atomically
  consumed, bound to the nonce cookie and exact Origin, and invalidated after
  issuance.
- Bound rejected challenge selections by source IP, not by attacker-controlled
  challenge value; distinct invented challenges share one rolling budget.
- Revalidate active identity and current USER roles at challenge consumption.
- Keep `__Host-` cookies, CSRF generation, SameSite, origin checks, and realm
  guards unchanged.
- Reject open redirects and never accept subject IDs, roles, or realms as
  authority from the browser.
- Log event metadata only; never credentials, raw session tokens, CSRF values,
  challenge values, or raw email.
- Both unified POST endpoints require the exact configured Origin and respond
  with `Cache-Control: no-store`.
