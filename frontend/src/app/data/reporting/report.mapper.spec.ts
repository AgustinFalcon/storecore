import { convertToParamMap } from '@angular/router';
import { ReportAvailability, ReportSource, ReportUnavailableReason, ReportValue } from '../../domain/reporting/report';
import { ReportQueryBoundary } from '../../domain/reporting/report-query';
import { ReportMapper } from './report.mapper';
import { reportEnvelopeFixture } from './report.spec-fixtures';
import { ReportQueryAdapter } from './report-query.adapter';

describe('report wire boundary', () => {
  const record = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
  const metrics = (envelope: Record<string, unknown>): Record<string, unknown> =>
    record(record(record(envelope)['data'])['metrics']);
  const period = (envelope: Record<string, unknown>): Record<string, unknown> =>
    record(record(envelope)['data'])['period'] as Record<string, unknown>;
  const available = (envelope: Record<string, unknown>, value: unknown, source: string, timeBasis: string, current = false) => {
    const p = period(envelope);
    return {
      availability: 'AVAILABLE', value,
      evidence: current
        ? { source, timeBasis, observedAt: p['generatedAt'], freshness: 'CURRENT' }
        : { source, timeBasis, observedAt: p['generatedAt'], freshness: 'CURRENT', fromInclusive: p['fromInclusive'], toExclusive: p['toExclusive'], periodToken: p['periodToken'] },
    };
  };
  it('maps the exact period and closed availability without converting lossless values', () => {
    const report = ReportMapper.envelope(reportEnvelopeFixture());
    expect(report.period.periodToken).toBe('a'.repeat(64));
    expect(report.metrics.createdOrders.availability).toBe(ReportAvailability.Available);
    expect(report.metrics.createdOrders.value?.count).toBe('2');
    expect(report.metrics.createdOrders.value?.nominalTotal).toBe('1234.50');
    expect(report.metrics.createdOrders.evidence?.source).toBe(ReportSource.StoreCoreOrder);
    expect(report.metrics.blackStoreSales.availability).toBe(ReportAvailability.NotAvailable);
  });

  it('fails only the corrupt metric closed while preserving valid siblings', () => {
    const unknown = structuredClone(reportEnvelopeFixture());
    record(record(record(record(unknown)['data'])['metrics'])['createdOrders'])['evidence'] = {
      ...record(record(record(record(unknown)['data'])['metrics'])['createdOrders'])['evidence'] as object,
      source: 'FUTURE_SOURCE',
    };
    const mappedUnknown = ReportMapper.envelope(unknown);
    expect(mappedUnknown.metrics.createdOrders.availability).toBe(ReportAvailability.Unknown);
    expect(mappedUnknown.metrics.blackStoreSales.availability).toBe(ReportAvailability.NotAvailable);

    const contradictory = structuredClone(reportEnvelopeFixture());
    record(record(record(record(contradictory)['data'])['metrics'])['createdOrders'])['evidence'] = {
      ...record(record(record(record(contradictory)['data'])['metrics'])['createdOrders'])['evidence'] as object,
      periodToken: 'b'.repeat(64),
    };
    expect(ReportMapper.envelope(contradictory).metrics.createdOrders.availability).toBe(ReportAvailability.Unknown);

    const fabricatedZero = structuredClone(reportEnvelopeFixture());
    record(record(record(fabricatedZero)['data'])['metrics'])['blackStoreSales'] = { availability: 'NOT_AVAILABLE', reason: 'UNSUPPORTED_CONTRACT', value: '0.00' };
    expect(ReportMapper.envelope(fabricatedZero).metrics.blackStoreSales.availability).toBe(ReportAvailability.Unknown);

    const unsupportedSupportedMetric = structuredClone(reportEnvelopeFixture());
    metrics(unsupportedSupportedMetric)['createdOrders'] = { availability: 'NOT_AVAILABLE', reason: 'UNSUPPORTED_CONTRACT' };
    expect(ReportMapper.envelope(unsupportedSupportedMetric).metrics.createdOrders.availability).toBe(ReportAvailability.Unknown);
  });

  it('keeps illegal ReportValue states unrepresentable', () => {
    expect(() => ReportValue.available(null, {} as never)).toThrow();
    expect(() => ReportValue.unavailable(ReportUnavailableReason.UnsupportedContract)).toThrow();
    expect(() => ReportValue.notAvailable(ReportUnavailableReason.NoEvidence)).toThrow();
    expect(() => ReportValue.unavailable(ReportUnavailableReason.Unknown)).toThrow();
    expect(ReportValue.unknown().availability).toBe(ReportAvailability.Unknown);
  });

  it('accepts unbounded canonical ARS and ASCII-boundary canonical text', () => {
    const envelope = reportEnvelopeFixture();
    record(record(metrics(envelope)['createdOrders'])['value'])['nominalTotal'] = '1000000000000.00';
    metrics(envelope)['bestSellers'] = available(envelope, {
      items: [{ variantId: '1', sku: '\u00a0SKU\u00a0', name: '\u00a0Taladro\u00a0', grossUnits: '1' }], total: '1', truncated: false,
    }, 'STORECORE_PAYMENT_APPLICATION', 'PAYMENT_APPLIED');
    const mapped = ReportMapper.envelope(envelope);
    expect(mapped.metrics.createdOrders.value?.nominalTotal).toBe('1000000000000.00');
    expect(mapped.metrics.bestSellers.availability).toBe(ReportAvailability.Available);
  });

  it('enforces the opaque catalog token boundary at exactly 64 characters', () => {
    const accepted = reportEnvelopeFixture();
    metrics(accepted)['blackStoreCatalogToken'] = available(accepted, 'x'.repeat(64), 'BLACKSTORE_STOCK_SAGA', 'CURRENT_SNAPSHOT', true);
    expect(ReportMapper.envelope(accepted).metrics.blackStoreCatalogToken.availability).toBe(ReportAvailability.Available);

    const rejected = reportEnvelopeFixture();
    metrics(rejected)['blackStoreCatalogToken'] = available(rejected, 'x'.repeat(65), 'BLACKSTORE_STOCK_SAGA', 'CURRENT_SNAPSHOT', true);
    expect(ReportMapper.envelope(rejected).metrics.blackStoreCatalogToken.availability).toBe(ReportAvailability.Unknown);
  });

  it('rejects impossible dates and non-current HTTP evidence per affected metric', () => {
    const invalidDate = reportEnvelopeFixture();
    record(record(metrics(invalidDate)['createdOrders'])['evidence'])['observedAt'] = '2026-02-30T00:00:00Z';
    expect(ReportMapper.envelope(invalidDate).metrics.createdOrders.availability).toBe(ReportAvailability.Unknown);

    const stale = reportEnvelopeFixture();
    record(record(metrics(stale)['createdOrders'])['evidence'])['freshness'] = 'STALE';
    expect(ReportMapper.envelope(stale).metrics.createdOrders.availability).toBe(ReportAvailability.Unknown);

    const invalidRoot = reportEnvelopeFixture();
    period(invalidRoot)['generatedAt'] = '2026-02-30T00:00:00Z';
    expect(() => ReportMapper.envelope(invalidRoot)).toThrow();
  });

  it('rejects contradictory scalar equations per affected metric', () => {
    const envelope = reportEnvelopeFixture();
    metrics(envelope)['appliedAccreditations'] = available(envelope, {
      count: '1', confirmedGross: '100.00', merchandiseSubtotal: '90.00', shippingAmount: '20.00',
    }, 'STORECORE_PAYMENT_APPLICATION', 'PAYMENT_APPLIED');
    metrics(envelope)['returnReceipts'] = available(envelope, { returnCount: '0', returnedUnits: '1' }, 'STORECORE_RETURN', 'RETURN_RECEIVED');
    metrics(envelope)['confirmedReturnDisposition'] = available(envelope, {
      confirmedReturnCount: '1', restockUnits: '9223372036854775807', damagedUnits: '1', rejectedUnits: '0',
    }, 'STORECORE_RETURN', 'DISPOSITION_CONFIRMED');
    const mapped = ReportMapper.envelope(envelope);
    expect(mapped.metrics.appliedAccreditations.availability).toBe(ReportAvailability.Unknown);
    expect(mapped.metrics.returnReceipts.availability).toBe(ReportAvailability.Unknown);
    expect(mapped.metrics.confirmedReturnDisposition.availability).toBe(ReportAvailability.Unknown);
  });

  it('rejects underfilled, unordered and aggregate-contradictory collections', () => {
    const envelope = reportEnvelopeFixture();
    metrics(envelope)['bestSellers'] = available(envelope, {
      items: [{ variantId: '1', sku: 'A', name: 'A', grossUnits: '2' }], total: '2', truncated: true,
    }, 'STORECORE_PAYMENT_APPLICATION', 'PAYMENT_APPLIED');
    metrics(envelope)['lowStock'] = available(envelope, {
      items: [
        { variantId: '2', sku: 'B', productName: 'B', variantLabel: 'B', availableQuantity: '2', safetyStock: '3' },
        { variantId: '1', sku: 'A', productName: 'A', variantLabel: 'A', availableQuantity: '1', safetyStock: '3' },
      ], total: '2', truncated: false,
    }, 'STORECORE_CURRENT_INVENTORY', 'CURRENT_SNAPSHOT', true);
    metrics(envelope)['blackStoreCurrentStock'] = available(envelope, {
      items: [{ variantId: '1', sku: 'A', productName: 'A', variantLabel: 'A', sellableQuantity: '7' }],
      total: '1', sellableUnits: '0', zeroSellableVariantCount: '1', truncated: false,
    }, 'STORECORE_CURRENT_INVENTORY', 'CURRENT_SNAPSHOT', true);
    const mapped = ReportMapper.envelope(envelope);
    expect(mapped.metrics.bestSellers.availability).toBe(ReportAvailability.Unknown);
    expect(mapped.metrics.lowStock.availability).toBe(ReportAvailability.Unknown);
    expect(mapped.metrics.blackStoreCurrentStock.availability).toBe(ReportAvailability.Unknown);
  });

  it('rejects illegal inventory channel pairs and noncanonical ordering', () => {
    const envelope = reportEnvelopeFixture();
    metrics(envelope)['inventoryMovements'] = available(envelope, { groups: [
      { eventType: 'SALE', channel: 'INTERNAL', count: '1', quantityDeltaSum: '-1' },
    ] }, 'STORECORE_INVENTORY_LEDGER', 'LEDGER_RECORDED');
    expect(ReportMapper.envelope(envelope).metrics.inventoryMovements.availability).toBe(ReportAvailability.Unknown);
  });

  it('owns an exact URL boundary and rejects extras duplicates and noncanonical ranges', () => {
    const valid = ReportQueryAdapter.fromUrl(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    expect(valid?.toUrlQuery()).toEqual({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' });
    expect(ReportQueryAdapter.fromUrl(convertToParamMap({ fromDate: ['2026-11-01', '2026-11-02'], toDateExclusive: '2026-11-26' }))).toBeNull();
    expect(ReportQueryAdapter.fromUrl(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26', extra: '1' }))).toBeNull();
    expect(ReportQueryBoundary.create('2026-1-01', '2026-11-26')).toBeNull();
    expect(ReportQueryBoundary.create('2025-01-01', '2026-01-03')).toBeNull();
  });
});
