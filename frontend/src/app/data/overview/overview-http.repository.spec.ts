import { OverviewFactState, OverviewPeriod, OverviewShipmentState, OverviewUnavailableReason, PendingPaymentReason } from '../../domain/overview/overview';
import { mapOperatorOverview } from './overview-http.repository';

const known = (value: number) => ({ state: 'KNOWN', value, reason: null });
const base = {
  period: 'TODAY', timezone: 'America/Argentina/Buenos_Aires', fromInclusive: '2026-11-08T03:00:00Z', toExclusive: '2026-11-08T18:00:00Z',
  accreditedRevenue: known(0), orderCount: known(2), activeCustomerCount: known(8), inventoryAtRiskCount: known(1),
  pendingPayments: { state: 'KNOWN', reason: null, totalCount: 1, truncated: false, items: [{ orderId: 1, orderNumber: 'SC-1', total: 1200, createdAt: '2026-11-08T12:00:00Z', reason: 'PENDING' }] },
  fulfillment: { state: 'KNOWN', reason: null, totalCount: 1, truncated: false, items: [{ orderId: 2, orderNumber: 'SC-2', total: 500, paidAt: '2026-11-08T13:00:00Z', shipmentState: 'PREPARING' }] },
  lowStock: { state: 'KNOWN', reason: null, totalCount: 1, truncated: false, items: [{ variantId: 3, sku: 'SKU-3', productName: 'Taladro', variantLabel: '13 mm', availableQuantity: 1, safetyStock: 2 }] },
};

describe('operator overview HTTP mapper', () => {
  it('maps closed wire types and preserves a known zero', () => {
    const value = mapOperatorOverview(base);
    expect(value.period).toBe(OverviewPeriod.Today); expect(value.accreditedRevenue.state).toBe(OverviewFactState.Known); expect(value.accreditedRevenue.value).toBe(0);
    expect(value.pendingPayments.items[0].reason).toBe(PendingPaymentReason.Pending); expect(value.fulfillment.items[0].shipmentState).toBe(OverviewShipmentState.Preparing);
  });
  it('maps future finite values to Unknown instead of exposing wire text', () => {
    const value = mapOperatorOverview({ ...base, period: 'FUTURE', pendingPayments: { ...base.pendingPayments, items: [{ ...base.pendingPayments.items[0], reason: 'FUTURE' }] } });
    expect(value.period).toBe(OverviewPeriod.Unknown); expect(value.pendingPayments.items[0].reason).toBe(PendingPaymentReason.Unknown);
  });
  it('requires null value and an empty list when facts are unavailable', () => {
    expect(mapOperatorOverview({ ...base, orderCount: { state: 'UNAVAILABLE', value: null, reason: 'FUTURE_REASON' } }).orderCount.reason).toBe(OverviewUnavailableReason.Unknown);
    expect(() => mapOperatorOverview({ ...base, orderCount: { state: 'UNAVAILABLE', value: 0, reason: 'PAYMENT_FACTS_INCOMPLETE' } })).toThrow();
    expect(() => mapOperatorOverview({ ...base, orderCount: { state: 'UNAVAILABLE', value: null, reason: null } })).toThrow();
    expect(() => mapOperatorOverview({ ...base, orderCount: { state: 'KNOWN', value: 0, reason: 'PAYMENT_FACTS_INCOMPLETE' } })).toThrow();
    expect(() => mapOperatorOverview({ ...base, lowStock: { state: 'UNAVAILABLE', items: base.lowStock.items, totalCount: null, truncated: false, reason: 'Sin snapshot' } })).toThrow();
    expect(() => mapOperatorOverview({ ...base, lowStock: { ...base.lowStock, totalCount: 2, truncated: false } })).toThrow();
  });
  it.each([
    { ...base, accreditedRevenue: { state: 'KNOWN', value: null, reason: null } },
    { ...base, fromInclusive: 'not-a-date' },
    { ...base, activeCustomerCount: known(-1) },
  ])('rejects malformed authoritative data', (value) => expect(() => mapOperatorOverview(value)).toThrow());
});
