/**
 * Storefront offer window. No Angular.
 * A missing window must not hide an offer the API already sent.
 * Both bounds show the badge only while now is inside [validFrom, validUntil),
 * using installation local time.
 * The home rail omits a product whose window is closed.
 * The catalog grid and the product detail keep that product and its effective
 * price, and clear only the offer badge.
 * offersOnly may mark a row, but not a row outside its own window.
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

type OfferBadgeProduct = {
  readonly offerRef: string | null;
  readonly validFrom?: string | null;
  readonly validUntil?: string | null;
};

/**
 * A missing window leaves offerRef and every price field as the API sent them.
 * A closed window keeps the product and its effective price and clears only offerRef.
 * Callers that list the catalog must map with this helper, not filter the product out.
 */
export function withoutClosedOfferBadge<T extends OfferBadgeProduct>(product: T, now: Date): T {
  if (isApiOfferVisible(product.validFrom, product.validUntil, now) || product.offerRef == null) {
    return product;
  }
  return { ...product, offerRef: null };
}

/**
 * Oferta badge for one product. A closed window hides the badge.
 * The product itself stays in the grid, and the API price is left alone.
 * offersOnly may mark a row that has no offerRef, but not a row outside its own window.
 * A missing window keeps the API offerRef.
 */
export function showsOfferBadge(
  offerRef: string | null | undefined,
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
  now: Date,
  offersOnly = false,
): boolean {
  if (!isApiOfferVisible(validFrom, validUntil, now)) {
    return false;
  }
  return offersOnly || Boolean(offerRef);
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
