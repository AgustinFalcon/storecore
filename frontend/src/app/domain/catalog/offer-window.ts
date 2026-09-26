/**
 * Storefront offer window. No Angular.
 * A missing window must not hide an offer the API already sent.
 * Both bounds show the badge and the home rail only while now is inside
 * [validFrom, validUntil), using installation local time.
 * This does not change the effective price.
 */

function parseBound(value: string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when the API sent both ends of a window. */
export function hasOfferWindow(validFrom: string | null | undefined, validUntil: string | null | undefined): boolean {
  return parseBound(validFrom) !== null && parseBound(validUntil) !== null;
}

/** Operator rule: validUntil must be strictly after validFrom. */
export function isValidOfferWindow(validFrom: string, validUntil: string): boolean {
  const from = parseBound(validFrom);
  const until = parseBound(validUntil);
  return from !== null && until !== null && until > from;
}

/**
 * Keep an API offer when the payload has no usable window.
 * When both bounds exist, keep it only inside [from, until).
 * An inverted window (until <= from) is not an open interval, so the offer stays hidden.
 */
export function isApiOfferVisible(
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
  now: Date,
): boolean {
  const from = parseBound(validFrom);
  const until = parseBound(validUntil);
  if (from === null || until === null) {
    return true;
  }
  if (until <= from) {
    return false;
  }
  const at = now.getTime();
  return at >= from && at < until;
}

/** datetime-local (installation clock) → ISO-8601 instant the promo API can parse. */
export function toInstallationInstant(value: string): string {
  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return trimmed;
  }
  return new Date(parsed).toISOString();
}
