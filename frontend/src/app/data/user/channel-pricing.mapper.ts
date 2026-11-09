import { BoundedRows } from '../../domain/catalog/bounded-rows';
import { ChannelAvailability, ChannelFactReason, ChannelObservation, ListingStatus, ObservationFreshness, PolicyStatus, PriceCurrency, PriceScope, PriceWriter } from '../../domain/user/channel-pricing';
import { MercadoLibreAccountStatus } from '../../domain/user/mercadolibre-account-status';
import { ManualPromo, MercadoLibreAccount, MercadoLibreListing } from '../../domain/user/user.entity';

function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Registro de canal inválido.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw new Error('Texto de canal inválido.'); return value.trim(); }
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function instant(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) throw new Error('Fecha de canal inválida.'); return result; }
function nullableInstant(value: unknown): string | null { return value === null ? null : instant(value); }
function amount(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Importe de canal inválido.'); return value; }
function nullableAmount(value: unknown): number | null { return value === null ? null : amount(value); }
export function mapChannelObservation(value: unknown, quantity = false): ChannelObservation {
  const data = row(value); const state = ChannelAvailability.fromWire(data['state']);
  const freshness = ObservationFreshness.fromWire(data['freshness']);
  const reason = data['reason'] === null ? null : ChannelFactReason.fromWire(data['reason']);
  if (state === ChannelAvailability.Unknown || freshness === ObservationFreshness.Unknown || reason === ChannelFactReason.Unknown) {
    return { state: ChannelAvailability.Unknown, value: null, freshness: ObservationFreshness.Unknown, reason: ChannelFactReason.Unknown };
  }
  if (state === ChannelAvailability.Known) {
    const result = amount(data['value']);
    if (freshness !== ObservationFreshness.Unverified || reason !== null || quantity && !Number.isSafeInteger(result)) throw new Error('Observación histórica contradictoria.');
    return { state, value: result, freshness, reason };
  }
  if (data['value'] !== null || freshness !== ObservationFreshness.Unavailable || reason !== ChannelFactReason.ExternalNotAvailable) throw new Error('Observación ausente contradictoria.');
  return { state, value: null, freshness, reason };
}
export function mapChannelPage<T>(value: unknown, translate: (value: unknown) => T): BoundedRows<T> {
  const data = row(value); const { items, total, page, size } = data;
  if (!Array.isArray(items) || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || typeof page !== 'number' || !Number.isSafeInteger(page) || page < 0 || page > 10000 || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > 50 || items.length > size || items.length > 0 && page * size + items.length > total) throw new Error('Página de canal inválida.');
  return Object.assign(items.map(translate), { metadata: { total, page, size, truncated: page * size + items.length < total } });
}
export function mapPricePolicy(value: unknown): ManualPromo {
  const data = row(value);
  const policy = { id: text(data['id']), listingSku: text(data['listingSku']), currency: PriceCurrency.fromWire(data['currency']),
    priceScope: PriceScope.fromWire(data['priceScope']), basePrice: amount(data['basePrice']), desiredPrice: amount(data['desiredPrice']),
    observedPrice: mapChannelObservation(data['observedPrice']), effectivePromoPrice: nullableAmount(data['effectivePromoPrice']),
    status: PolicyStatus.fromWire(data['status']), validFrom: instant(data['validFrom']), validTo: instant(data['validTo']),
    writer: PriceWriter.fromWire(data['writer']), approvedBy: nullableText(data['approvedBy']), approvedAt: nullableInstant(data['approvedAt']) };
  if (Date.parse(policy.validTo) <= Date.parse(policy.validFrom) || policy.effectivePromoPrice !== null && policy.effectivePromoPrice > policy.desiredPrice ||
    (policy.approvedBy === null) !== (policy.approvedAt === null) || policy.status === PolicyStatus.Active && policy.approvedBy === null) throw new Error('Política de precio contradictoria.');
  return policy;
}
export function mapChannelAccount(value: unknown): MercadoLibreAccount {
  const data = row(value); const availability = ChannelAvailability.fromWire(data['availability']);
  const accountRef = nullableText(data['accountRef']); const reason = data['reason'] === null ? null : ChannelFactReason.fromWire(data['reason']);
  if (availability === ChannelAvailability.Known && (!accountRef || reason !== null) || availability === ChannelAvailability.Unavailable && (accountRef !== null || reason !== ChannelFactReason.ExternalNotAvailable)) throw new Error('Cuenta de canal contradictoria.');
  return { accountRef, status: MercadoLibreAccountStatus.fromWire(data['status']), availability, reason, updatedAt: nullableInstant(data['updatedAt']) };
}
export function mapChannelListing(value: unknown): MercadoLibreListing {
  const data = row(value); const desiredQuantity = amount(data['desiredQuantity']);
  if (!Number.isSafeInteger(desiredQuantity) || typeof data['manualInterventionRequired'] !== 'boolean' || typeof data['variationId'] !== 'string') throw new Error('Publicación de canal inválida.');
  return { listingId: text(data['listingId']), variationId: data['variationId'].trim(), sku: text(data['sku']), accountRef: text(data['accountRef']),
    status: ListingStatus.fromWire(data['status']), desiredQuantity, desiredPrice: nullableAmount(data['desiredPrice']),
    observedQuantity: mapChannelObservation(data['observedQuantity'], true), observedPrice: mapChannelObservation(data['observedPrice']),
    manualInterventionRequired: data['manualInterventionRequired'], updatedAt: nullableInstant(data['updatedAt']) };
}
