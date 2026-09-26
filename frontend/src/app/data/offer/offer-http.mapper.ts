import { StorefrontOffer } from '../../domain/offer/storefront-offer.entity';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return typeof value === 'string' ? value : String(value);
}

/** Keep the API decimal text. A missing amount stays blank; it is not turned into 0. */
export function decimalText(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function skusOf(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
}

export function mapStorefrontOffer(value: unknown): StorefrontOffer {
  const row = asRecord(value);
  return {
    id: text(row['id']),
    name: text(row['name']),
    status: text(row['status']),
    priority: Number.isFinite(Number(row['priority'])) ? Math.trunc(Number(row['priority'])) : 0,
    startsAt: text(row['startsAt']),
    endsAt: text(row['endsAt']),
    discountType: text(row['discountType']),
    discountValue: decimalText(row['discountValue']),
    minMarginPercent: decimalText(row['minMarginPercent']),
    skus: skusOf(row['skus']),
    approvedBy: nullableText(row['approvedBy']),
    approvedAt: nullableText(row['approvedAt']),
  };
}

export function mapStorefrontOffers(value: unknown): readonly StorefrontOffer[] {
  return Array.isArray(value) ? value.map(mapStorefrontOffer) : [];
}
