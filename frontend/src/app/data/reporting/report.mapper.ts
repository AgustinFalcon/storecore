import {
  AppliedAccreditationMetrics,
  BestSellerReport,
  BlackStoreCurrentStockReport,
  BlackStoreOperationDiagnostics,
  BlackStoreOperationState,
  BlackStoreRegistrationReport,
  BlackStoreRegistrationState,
  BlackStoreRetiredOperationState,
  ChannelReport,
  ConfirmedReturnDispositionMetrics,
  CreatedOrderMetrics,
  InventoryMovementReport,
  LowStockReport,
  PaymentDispositionReport,
  ReportAvailability,
  ReportEvidence,
  ReportFreshness,
  ReportInventoryChannel,
  ReportInventoryEventType,
  ReportModuleState,
  ReportPaymentDisposition,
  ReportPeriod,
  ReportSource,
  ReportTimeBasis,
  ReportUnavailableReason,
  ReportValue,
  ReturnReceiptMetrics,
} from '../../domain/reporting/report';

type JsonObject = Record<string, unknown>;
type ValueMapper<T> = (raw: unknown) => T;
type EvidencePolicy = Readonly<{ source: ReportSource; basis: ReportTimeBasis }>;

function invalid(): never { throw new Error('Reporte no disponible: contrato inválido'); }
function object(raw: unknown, keys: readonly string[]): JsonObject {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  const value = raw as JsonObject;
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) return invalid();
  return value;
}
function metricsObject(raw: unknown, keys: readonly string[]): JsonObject {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  const value = raw as JsonObject;
  if (Object.keys(value).some(key => !keys.includes(key))) return invalid();
  return value;
}
function array(raw: unknown): readonly unknown[] { return Array.isArray(raw) ? raw : invalid(); }
function text(raw: unknown): string {
  return typeof raw === 'string' && raw.length > 0 && raw.charCodeAt(0) > 0x20 && raw.charCodeAt(raw.length - 1) > 0x20 ? raw : invalid();
}
function opaqueCatalogToken(raw: unknown): string { const value = text(raw); return value.length <= 64 ? value : invalid(); }
function bool(raw: unknown): boolean { return typeof raw === 'boolean' ? raw : invalid(); }
function instant(raw: unknown): string {
  const value = text(raw);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.[0-9]{1,9})?Z$/.exec(value);
  if (!match || !validDate(match[1], match[2], match[3])) return invalid();
  const [, , , , hour, minute, second] = match;
  return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 ? value : invalid();
}
function validDate(year: string, month: string, day: string): boolean {
  const value = `${year}-${month}-${day}`;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function localDate(raw: unknown): string {
  const value = text(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const [year, month, day] = value.split('-');
  return validDate(year, month, day) ? value : invalid();
}
function token(raw: unknown): string { const value = text(raw); return /^[0-9a-f]{64}$/.test(value) ? value : invalid(); }
function unsigned(raw: unknown, positive = false): string {
  const value = typeof raw === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(raw) ? raw : invalid();
  const parsed = BigInt(value);
  if (parsed > 9223372036854775807n || positive && parsed === 0n) return invalid();
  return value;
}
function signed(raw: unknown): string {
  const value = typeof raw === 'string' && /^(0|-?[1-9][0-9]{0,18})$/.test(raw) ? raw : invalid();
  const parsed = BigInt(value);
  return parsed >= -9223372036854775808n && parsed <= 9223372036854775807n ? value : invalid();
}
function money(raw: unknown): string { return typeof raw === 'string' && /^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(raw) ? raw : invalid(); }
function finite<T>(value: T, unknown: T): T { return value === unknown ? invalid() : value; }
function longSum(values: readonly string[]): bigint {
  const sum = values.reduce((total, value) => total + BigInt(value), 0n);
  return sum <= 9223372036854775807n ? sum : invalid();
}
function moneyCents(value: string): bigint { return BigInt(value.replace('.', '')); }
function exactCollection(total: string, itemCount: number, limit: number, truncated: boolean): void {
  const totalValue = BigInt(total);
  const expected = totalValue < BigInt(limit) ? Number(totalValue) : limit;
  if (itemCount !== expected || truncated !== (totalValue > BigInt(itemCount))) return invalid();
}
function ordered<T>(items: readonly T[], compare: (left: T, right: T) => number): boolean {
  return items.every((item, index) => index === 0 || compare(items[index - 1], item) <= 0);
}

const ORDER_CREATED = { source: ReportSource.StoreCoreOrder, basis: ReportTimeBasis.OrderCreated } as const;
const PAYMENT_APPLIED = { source: ReportSource.StoreCorePaymentApplication, basis: ReportTimeBasis.PaymentApplied } as const;
const PAYMENT_DISPOSITION = { source: ReportSource.StoreCorePaymentApplication, basis: ReportTimeBasis.OrderCreated } as const;
const LEDGER_RECORDED = { source: ReportSource.StoreCoreInventoryLedger, basis: ReportTimeBasis.LedgerRecorded } as const;
const RETURN_RECEIVED = { source: ReportSource.StoreCoreReturn, basis: ReportTimeBasis.ReturnReceived } as const;
const DISPOSITION_CONFIRMED = { source: ReportSource.StoreCoreReturn, basis: ReportTimeBasis.DispositionConfirmed } as const;
const CURRENT_INVENTORY = { source: ReportSource.StoreCoreCurrentInventory, basis: ReportTimeBasis.CurrentSnapshot } as const;
const BLACKSTORE_CURRENT = { source: ReportSource.BlackStoreStockSaga, basis: ReportTimeBasis.CurrentSnapshot } as const;

export class ReportMapper {
  static envelope(raw: unknown): ChannelReport {
    const envelope = object(raw, ['code', 'data', 'message', 'errorCode', 'retryable', 'traceId']);
    if (envelope['code'] !== 200 || envelope['errorCode'] !== null || envelope['data'] === null) return invalid();
    return this.report(envelope['data']);
  }

  static report(raw: unknown): ChannelReport {
    const root = object(raw, ['contractVersion', 'period', 'metrics']);
    if (root['contractVersion'] !== 'storecore-channel-report-v1') return invalid();
    const period = this.period(root['period']);
    const metrics = metricsObject(root['metrics'], [
      'createdOrders', 'appliedAccreditations', 'bestSellers', 'paymentDisposition', 'inventoryMovements', 'lowStock',
      'returnReceipts', 'confirmedReturnDisposition', 'netRevenue', 'reversalAmount', 'fiscalTotal', 'blackStoreModuleState',
      'blackStoreRegistration', 'blackStoreOperations', 'blackStoreCatalogToken', 'blackStoreCurrentStock',
      'blackStoreRemoteFreshness', 'blackStoreSales', 'blackStoreRevenue', 'blackStorePayments', 'blackStoreReturns',
      'blackStoreMonetaryChannelMix', 'blackStoreHistoricalStock', 'blackStoreSynchronization',
    ]);
    const report = Object.freeze({
      contractVersion: 'storecore-channel-report-v1' as const,
      period,
      metrics: Object.freeze({
        createdOrders: this.safe(() => this.metric(metrics['createdOrders'], period, ORDER_CREATED, this.createdOrders)),
        appliedAccreditations: this.safe(() => this.metric(metrics['appliedAccreditations'], period, PAYMENT_APPLIED, this.appliedAccreditations)),
        bestSellers: this.safe(() => this.metric(metrics['bestSellers'], period, PAYMENT_APPLIED, this.bestSellers)),
        paymentDisposition: this.safe(() => this.metric(metrics['paymentDisposition'], period, PAYMENT_DISPOSITION, this.paymentDisposition)),
        inventoryMovements: this.safe(() => this.metric(metrics['inventoryMovements'], period, LEDGER_RECORDED, this.inventoryMovements)),
        lowStock: this.safe(() => this.metric(metrics['lowStock'], period, CURRENT_INVENTORY, this.lowStock)),
        returnReceipts: this.safe(() => this.metric(metrics['returnReceipts'], period, RETURN_RECEIVED, this.returnReceipts)),
        confirmedReturnDisposition: this.safe(() => this.metric(metrics['confirmedReturnDisposition'], period, DISPOSITION_CONFIRMED, this.confirmedReturnDisposition)),
        netRevenue: this.safe(() => this.notAvailable<string>(metrics['netRevenue'], ReportUnavailableReason.ReversalAmountUnavailable)),
        reversalAmount: this.safe(() => this.notAvailable<string>(metrics['reversalAmount'], ReportUnavailableReason.ReversalAmountUnavailable)),
        fiscalTotal: this.safe(() => this.notAvailable<string>(metrics['fiscalTotal'], ReportUnavailableReason.ReversalAmountUnavailable)),
        blackStoreModuleState: this.safe(() => this.metric(metrics['blackStoreModuleState'], period, BLACKSTORE_CURRENT, raw => finite(ReportModuleState.fromWire(raw), ReportModuleState.Unknown))),
        blackStoreRegistration: this.safe(() => this.metric(metrics['blackStoreRegistration'], period, BLACKSTORE_CURRENT, this.registration)),
        blackStoreOperations: this.safe(() => this.metric(metrics['blackStoreOperations'], period, BLACKSTORE_CURRENT, value => this.operations(value, period))),
        blackStoreCatalogToken: this.safe(() => this.metric(metrics['blackStoreCatalogToken'], period, BLACKSTORE_CURRENT, opaqueCatalogToken)),
        blackStoreCurrentStock: this.safe(() => this.metric(metrics['blackStoreCurrentStock'], period, CURRENT_INVENTORY, this.currentStock)),
        blackStoreRemoteFreshness: this.safe(() => this.unavailable<string>(metrics['blackStoreRemoteFreshness'], ReportUnavailableReason.NoEvidence)),
        blackStoreSales: this.safe(() => this.notAvailable<string>(metrics['blackStoreSales'], ReportUnavailableReason.UnsupportedContract)),
        blackStoreRevenue: this.safe(() => this.notAvailable<string>(metrics['blackStoreRevenue'], ReportUnavailableReason.UnsupportedContract)),
        blackStorePayments: this.safe(() => this.notAvailable<string>(metrics['blackStorePayments'], ReportUnavailableReason.UnsupportedContract)),
        blackStoreReturns: this.safe(() => this.notAvailable<string>(metrics['blackStoreReturns'], ReportUnavailableReason.UnsupportedContract)),
        blackStoreMonetaryChannelMix: this.safe(() => this.notAvailable<string>(metrics['blackStoreMonetaryChannelMix'], ReportUnavailableReason.UnsupportedContract)),
        blackStoreHistoricalStock: this.safe(() => this.notAvailable<string>(metrics['blackStoreHistoricalStock'], ReportUnavailableReason.UnsupportedContract)),
        blackStoreSynchronization: this.safe(() => this.notAvailable<string>(metrics['blackStoreSynchronization'], ReportUnavailableReason.UnsupportedContract)),
      }),
    });
    return report;
  }

  private static safe<T>(decode: () => ReportValue<T>): ReportValue<T> {
    try { return decode(); } catch { return ReportValue.unknown<T>(); }
  }

  private static period(raw: unknown): ReportPeriod {
    const value = object(raw, ['fromDate', 'toDateExclusive', 'timezone', 'fromInclusive', 'toExclusive', 'generatedAt', 'periodToken']);
    const fromDate = localDate(value['fromDate']);
    const toDateExclusive = localDate(value['toDateExclusive']);
    const days = (Date.parse(`${toDateExclusive}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000;
    if (!Number.isInteger(days) || days < 1 || days > 366) return invalid();
    const timezone = text(value['timezone']);
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { return invalid(); }
    const fromInclusive = instant(value['fromInclusive']);
    const toExclusive = instant(value['toExclusive']);
    const generatedAt = instant(value['generatedAt']);
    if (Date.parse(toExclusive) <= Date.parse(fromInclusive)) return invalid();
    return Object.freeze({ fromDate, toDateExclusive, timezone, fromInclusive, toExclusive, generatedAt, periodToken: token(value['periodToken']) });
  }

  private static metric<T>(raw: unknown, period: ReportPeriod, policy: EvidencePolicy, mapper: ValueMapper<T>): ReportValue<T> {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonObject : invalid();
    const availability = finite(ReportAvailability.fromWire(source['availability']), ReportAvailability.Unknown);
    if (availability === ReportAvailability.Available) {
      const value = object(raw, ['availability', 'value', 'evidence']);
      return ReportValue.available(mapper(value['value']), this.evidence(value['evidence'], period, policy));
    }
    const value = object(raw, ['availability', 'reason']);
    const reason = finite(ReportUnavailableReason.fromWire(value['reason']), ReportUnavailableReason.Unknown);
    if (availability !== ReportAvailability.Unavailable || reason.availability !== availability) return invalid();
    return ReportValue.unavailable(reason);
  }

  private static unavailable<T>(raw: unknown, expected: ReportUnavailableReason): ReportValue<T> {
    const value = object(raw, ['availability', 'reason']);
    const availability = finite(ReportAvailability.fromWire(value['availability']), ReportAvailability.Unknown);
    const reason = finite(ReportUnavailableReason.fromWire(value['reason']), ReportUnavailableReason.Unknown);
    if (availability !== ReportAvailability.Unavailable || reason !== expected || reason.availability !== availability) return invalid();
    return ReportValue.unavailable<T>(reason);
  }
  private static notAvailable<T>(raw: unknown, expected: ReportUnavailableReason): ReportValue<T> {
    const value = object(raw, ['availability', 'reason']);
    const availability = finite(ReportAvailability.fromWire(value['availability']), ReportAvailability.Unknown);
    const reason = finite(ReportUnavailableReason.fromWire(value['reason']), ReportUnavailableReason.Unknown);
    if (availability !== ReportAvailability.NotAvailable || reason !== expected || reason.availability !== availability) return invalid();
    return ReportValue.notAvailable<T>(reason);
  }

  private static evidence(raw: unknown, period: ReportPeriod, policy: EvidencePolicy): ReportEvidence {
    const current = policy.basis === ReportTimeBasis.CurrentSnapshot;
    const value = object(raw, current
      ? ['source', 'timeBasis', 'observedAt', 'freshness']
      : ['source', 'timeBasis', 'observedAt', 'freshness', 'fromInclusive', 'toExclusive', 'periodToken']);
    const source = finite(ReportSource.fromWire(value['source']), ReportSource.Unknown);
    const basis = finite(ReportTimeBasis.fromWire(value['timeBasis']), ReportTimeBasis.Unknown);
    const freshness = finite(ReportFreshness.fromWire(value['freshness']), ReportFreshness.Unknown);
    if (source !== policy.source || basis !== policy.basis || freshness !== ReportFreshness.Current) return invalid();
    const observedAt = instant(value['observedAt']);
    if (current) {
      if (observedAt !== period.generatedAt) return invalid();
      return Object.freeze({ source, timeBasis: basis, observedAt, freshness, fromInclusive: null, toExclusive: null, periodToken: null });
    }
    if (observedAt !== period.generatedAt || value['fromInclusive'] !== period.fromInclusive || value['toExclusive'] !== period.toExclusive || value['periodToken'] !== period.periodToken) return invalid();
    return Object.freeze({ source, timeBasis: basis, observedAt, freshness, fromInclusive: period.fromInclusive, toExclusive: period.toExclusive, periodToken: period.periodToken });
  }

  private static createdOrders(raw: unknown): CreatedOrderMetrics { const v = object(raw, ['count', 'nominalTotal']); return Object.freeze({ count: unsigned(v['count']), nominalTotal: money(v['nominalTotal']) }); }
  private static appliedAccreditations(raw: unknown): AppliedAccreditationMetrics {
    const v = object(raw, ['count', 'confirmedGross', 'merchandiseSubtotal', 'shippingAmount']);
    const count = unsigned(v['count']); const confirmedGross = money(v['confirmedGross']);
    const merchandiseSubtotal = money(v['merchandiseSubtotal']); const shippingAmount = money(v['shippingAmount']);
    if (moneyCents(confirmedGross) !== moneyCents(merchandiseSubtotal) + moneyCents(shippingAmount) || count === '0' && confirmedGross !== '0.00') return invalid();
    return Object.freeze({ count, confirmedGross, merchandiseSubtotal, shippingAmount });
  }
  private static bestSellers(raw: unknown): BestSellerReport {
    const v = object(raw, ['items', 'total', 'truncated']); const total = unsigned(v['total']);
    const items = array(v['items']).map(item => { const row = object(item, ['variantId', 'sku', 'name', 'grossUnits']); return Object.freeze({ variantId: unsigned(row['variantId'], true), sku: text(row['sku']), name: text(row['name']), grossUnits: unsigned(row['grossUnits'], true) }); });
    const truncated = bool(v['truncated']);
    exactCollection(total, items.length, 20, truncated);
    if (new Set(items.map(item => item.variantId)).size !== items.length || !ordered(items, (a, b) => {
      const unitOrder = BigInt(b.grossUnits) - BigInt(a.grossUnits);
      return unitOrder === 0n ? (BigInt(a.variantId) < BigInt(b.variantId) ? -1 : BigInt(a.variantId) > BigInt(b.variantId) ? 1 : 0) : unitOrder < 0n ? -1 : 1;
    })) return invalid();
    return Object.freeze({ items: Object.freeze(items), total, truncated });
  }
  private static paymentDisposition(raw: unknown): PaymentDispositionReport {
    const v = object(raw, ['pending', 'approved', 'rejected', 'cancelled', 'refunded', 'chargedBack']);
    const counts = new Map<ReportPaymentDisposition, string>([[ReportPaymentDisposition.Pending, unsigned(v['pending'])], [ReportPaymentDisposition.Approved, unsigned(v['approved'])], [ReportPaymentDisposition.Rejected, unsigned(v['rejected'])], [ReportPaymentDisposition.Cancelled, unsigned(v['cancelled'])], [ReportPaymentDisposition.Refunded, unsigned(v['refunded'])], [ReportPaymentDisposition.ChargedBack, unsigned(v['chargedBack'])]]);
    return Object.freeze({ counts });
  }
  private static inventoryMovements(raw: unknown): InventoryMovementReport {
    const v = object(raw, ['groups']); const groups = array(v['groups']).map(group => { const row = object(group, ['eventType', 'channel', 'count', 'quantityDeltaSum']); const eventType = finite(ReportInventoryEventType.fromWire(row['eventType']), ReportInventoryEventType.Unknown); const channel = finite(ReportInventoryChannel.fromWire(row['channel']), ReportInventoryChannel.Unknown); if (!eventType.accepts(channel)) return invalid(); return Object.freeze({ eventType, channel, count: unsigned(row['count'], true), quantityDeltaSum: signed(row['quantityDeltaSum']) }); });
    if (new Set(groups.map(group => `${group.eventType.wire}:${group.channel.wire}`)).size !== groups.length || !ordered(groups, (a, b) => `${a.eventType.wire}:${a.channel.wire}`.localeCompare(`${b.eventType.wire}:${b.channel.wire}`, 'en'))) return invalid();
    return Object.freeze({ groups: Object.freeze(groups) });
  }
  private static lowStock(raw: unknown): LowStockReport {
    const v = object(raw, ['items', 'total', 'truncated']); const total = unsigned(v['total']);
    const items = array(v['items']).map(item => { const row = object(item, ['variantId', 'sku', 'productName', 'variantLabel', 'availableQuantity', 'safetyStock']); const availableQuantity = unsigned(row['availableQuantity']); const safetyStock = unsigned(row['safetyStock']); if (BigInt(availableQuantity) > BigInt(safetyStock)) return invalid(); return Object.freeze({ variantId: unsigned(row['variantId'], true), sku: text(row['sku']), productName: text(row['productName']), variantLabel: text(row['variantLabel']), availableQuantity, safetyStock }); });
    const truncated = bool(v['truncated']);
    exactCollection(total, items.length, 50, truncated);
    if (new Set(items.map(item => item.variantId)).size !== items.length || !ordered(items, (a, b) => {
      const quantityOrder = BigInt(a.availableQuantity) - BigInt(b.availableQuantity);
      return quantityOrder === 0n ? (BigInt(a.variantId) < BigInt(b.variantId) ? -1 : BigInt(a.variantId) > BigInt(b.variantId) ? 1 : 0) : quantityOrder < 0n ? -1 : 1;
    })) return invalid();
    return Object.freeze({ items: Object.freeze(items), total, truncated });
  }
  private static returnReceipts(raw: unknown): ReturnReceiptMetrics {
    const v = object(raw, ['returnCount', 'returnedUnits']); const returnCount = unsigned(v['returnCount']); const returnedUnits = unsigned(v['returnedUnits']);
    if ((returnCount === '0') !== (returnedUnits === '0')) return invalid();
    return Object.freeze({ returnCount, returnedUnits });
  }
  private static confirmedReturnDisposition(raw: unknown): ConfirmedReturnDispositionMetrics {
    const v = object(raw, ['confirmedReturnCount', 'restockUnits', 'damagedUnits', 'rejectedUnits']);
    const confirmedReturnCount = unsigned(v['confirmedReturnCount']); const restockUnits = unsigned(v['restockUnits']);
    const damagedUnits = unsigned(v['damagedUnits']); const rejectedUnits = unsigned(v['rejectedUnits']);
    const total = longSum([restockUnits, damagedUnits, rejectedUnits]);
    if ((confirmedReturnCount === '0') !== (total === 0n)) return invalid();
    return Object.freeze({ confirmedReturnCount, restockUnits, damagedUnits, rejectedUnits });
  }
  private static registration(raw: unknown): BlackStoreRegistrationReport { const v = object(raw, ['state', 'revokedHistoryCount']); const state = finite(BlackStoreRegistrationState.fromWire(v['state']), BlackStoreRegistrationState.Unknown); const count = unsigned(v['revokedHistoryCount']); if (state === BlackStoreRegistrationState.Absent && count !== '0' || state === BlackStoreRegistrationState.RevokedOnly && count === '0') return invalid(); return Object.freeze({ state, revokedHistoryCount: count }); }
  private static operations(raw: unknown, period: ReportPeriod): BlackStoreOperationDiagnostics {
    const v = object(raw, ['retained', 'retired', 'latestRetainedActivity', 'latestRetiredActivity']);
    const retainedRaw = object(v['retained'], ['pending', 'reserved', 'committed', 'released', 'expired']);
    const retiredRaw = object(v['retired'], ['committed', 'released', 'expired']);
    const retained = new Map([[BlackStoreOperationState.Pending, unsigned(retainedRaw['pending'])], [BlackStoreOperationState.Reserved, unsigned(retainedRaw['reserved'])], [BlackStoreOperationState.Committed, unsigned(retainedRaw['committed'])], [BlackStoreOperationState.Released, unsigned(retainedRaw['released'])], [BlackStoreOperationState.Expired, unsigned(retainedRaw['expired'])]]);
    const retired = new Map([[BlackStoreRetiredOperationState.Committed, unsigned(retiredRaw['committed'])], [BlackStoreRetiredOperationState.Released, unsigned(retiredRaw['released'])], [BlackStoreRetiredOperationState.Expired, unsigned(retiredRaw['expired'])]]);
    return Object.freeze({ retained, retired, latestRetainedActivity: this.activity(v['latestRetainedActivity'], period), latestRetiredActivity: this.activity(v['latestRetiredActivity'], period) });
  }
  private static activity(raw: unknown, period: ReportPeriod): ReportValue<string> {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonObject : invalid();
    const availability = finite(ReportAvailability.fromWire(source['availability']), ReportAvailability.Unknown);
    if (availability === ReportAvailability.Available) return this.metric(raw, period, BLACKSTORE_CURRENT, instant);
    return this.unavailable(raw, ReportUnavailableReason.NoEvidence);
  }
  private static currentStock(raw: unknown): BlackStoreCurrentStockReport {
    const v = object(raw, ['items', 'total', 'sellableUnits', 'zeroSellableVariantCount', 'truncated']); const total = unsigned(v['total']);
    const items = array(v['items']).map(item => { const row = object(item, ['variantId', 'sku', 'productName', 'variantLabel', 'sellableQuantity']); return Object.freeze({ variantId: unsigned(row['variantId'], true), sku: text(row['sku']), productName: text(row['productName']), variantLabel: text(row['variantLabel']), sellableQuantity: unsigned(row['sellableQuantity']) }); });
    const truncated = bool(v['truncated']); const sellableUnits = unsigned(v['sellableUnits']); const zeroSellableVariantCount = unsigned(v['zeroSellableVariantCount']);
    exactCollection(total, items.length, 50, truncated);
    if (new Set(items.map(item => item.variantId)).size !== items.length || !ordered(items, (a, b) => BigInt(a.variantId) < BigInt(b.variantId) ? -1 : BigInt(a.variantId) > BigInt(b.variantId) ? 1 : 0)) return invalid();
    const visibleSellable = longSum(items.map(item => item.sellableQuantity));
    const visibleZero = BigInt(items.filter(item => item.sellableQuantity === '0').length);
    const hiddenCount = BigInt(total) - BigInt(items.length);
    const aggregateSellable = BigInt(sellableUnits); const aggregateZero = BigInt(zeroSellableVariantCount);
    if (aggregateZero < visibleZero || aggregateZero > visibleZero + hiddenCount || aggregateSellable < visibleSellable) return invalid();
    const hiddenPositive = hiddenCount - (aggregateZero - visibleZero);
    const hiddenSellable = aggregateSellable - visibleSellable;
    if (hiddenPositive === 0n ? hiddenSellable !== 0n : hiddenSellable < hiddenPositive) return invalid();
    return Object.freeze({ items: Object.freeze(items), total, sellableUnits, zeroSellableVariantCount, truncated });
  }
}
