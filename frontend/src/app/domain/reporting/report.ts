import type { Observable } from 'rxjs';
import { BlackStoreOperationState, BlackStoreRegistrationState, BlackStoreRetiredOperationState, ReportAvailability, ReportExportFailureKind, ReportFreshness, ReportInventoryChannel, ReportInventoryEventType, ReportModuleState, ReportPaymentDisposition, ReportSource, ReportTimeBasis, ReportUnavailableReason } from './report-types';
export * from './report-types';

export interface ReportPeriodQuery { readonly fromDate: string; readonly toDateExclusive: string; }
export interface ReportExportQuery extends ReportPeriodQuery { readonly periodToken: string; }
export interface ReportExportFile { readonly filename: string; readonly blob: Blob; }
export class ReportExportFailure extends Error {
  constructor(readonly kind: ReportExportFailureKind) { super(kind.label); this.name = 'ReportExportFailure'; }
}
export interface ReportPeriod extends ReportPeriodQuery { readonly timezone: string; readonly fromInclusive: string; readonly toExclusive: string; readonly generatedAt: string; readonly periodToken: string; }
export interface ReportEvidence { readonly source: ReportSource; readonly timeBasis: ReportTimeBasis; readonly observedAt: string; readonly freshness: ReportFreshness; readonly fromInclusive: string | null; readonly toExclusive: string | null; readonly periodToken: string | null; }

export class ReportValue<T> {
  private constructor(
    readonly availability: ReportAvailability,
    readonly value: T | null,
    readonly evidence: ReportEvidence | null,
    readonly reason: ReportUnavailableReason | null,
  ) {}
  static available<T>(value: T, evidence: ReportEvidence): ReportValue<T> {
    if (value === null || value === undefined || !evidence) throw new Error('ReportValue disponible inválido');
    return Object.freeze(new ReportValue(ReportAvailability.Available, value, evidence, null));
  }
  static unavailable<T>(reason: ReportUnavailableReason): ReportValue<T> {
    if (reason === ReportUnavailableReason.Unknown || reason.availability !== ReportAvailability.Unavailable) throw new Error('Motivo UNAVAILABLE inválido');
    return Object.freeze(new ReportValue<T>(ReportAvailability.Unavailable, null, null, reason));
  }
  static notAvailable<T>(reason: ReportUnavailableReason): ReportValue<T> {
    if (reason === ReportUnavailableReason.Unknown || reason.availability !== ReportAvailability.NotAvailable) throw new Error('Motivo NOT_AVAILABLE inválido');
    return Object.freeze(new ReportValue<T>(ReportAvailability.NotAvailable, null, null, reason));
  }
  static unknown<T>(): ReportValue<T> { return Object.freeze(new ReportValue<T>(ReportAvailability.Unknown, null, null, null)); }
}

export interface CreatedOrderMetrics { readonly count: string; readonly nominalTotal: string; }
export interface AppliedAccreditationMetrics { readonly count: string; readonly confirmedGross: string; readonly merchandiseSubtotal: string; readonly shippingAmount: string; }
export interface BestSellerItem { readonly variantId: string; readonly sku: string; readonly name: string; readonly grossUnits: string; }
export interface BestSellerReport { readonly items: readonly BestSellerItem[]; readonly total: string; readonly truncated: boolean; }
export interface PaymentDispositionReport { readonly counts: ReadonlyMap<ReportPaymentDisposition, string>; }
export interface InventoryMovementMetric { readonly eventType: ReportInventoryEventType; readonly channel: ReportInventoryChannel; readonly count: string; readonly quantityDeltaSum: string; }
export interface InventoryMovementReport { readonly groups: readonly InventoryMovementMetric[]; }
export interface LowStockItem { readonly variantId: string; readonly sku: string; readonly productName: string; readonly variantLabel: string; readonly availableQuantity: string; readonly safetyStock: string; }
export interface LowStockReport { readonly items: readonly LowStockItem[]; readonly total: string; readonly truncated: boolean; }
export interface ReturnReceiptMetrics { readonly returnCount: string; readonly returnedUnits: string; }
export interface ConfirmedReturnDispositionMetrics { readonly confirmedReturnCount: string; readonly restockUnits: string; readonly damagedUnits: string; readonly rejectedUnits: string; }
export interface BlackStoreRegistrationReport { readonly state: BlackStoreRegistrationState; readonly revokedHistoryCount: string; }
export interface BlackStoreOperationDiagnostics { readonly retained: ReadonlyMap<BlackStoreOperationState, string>; readonly retired: ReadonlyMap<BlackStoreRetiredOperationState, string>; readonly latestRetainedActivity: ReportValue<string>; readonly latestRetiredActivity: ReportValue<string>; }
export interface BlackStoreStockItem { readonly variantId: string; readonly sku: string; readonly productName: string; readonly variantLabel: string; readonly sellableQuantity: string; }
export interface BlackStoreCurrentStockReport { readonly items: readonly BlackStoreStockItem[]; readonly total: string; readonly sellableUnits: string; readonly zeroSellableVariantCount: string; readonly truncated: boolean; }

export interface ChannelReportMetrics {
  readonly createdOrders: ReportValue<CreatedOrderMetrics>;
  readonly appliedAccreditations: ReportValue<AppliedAccreditationMetrics>;
  readonly bestSellers: ReportValue<BestSellerReport>;
  readonly paymentDisposition: ReportValue<PaymentDispositionReport>;
  readonly inventoryMovements: ReportValue<InventoryMovementReport>;
  readonly lowStock: ReportValue<LowStockReport>;
  readonly returnReceipts: ReportValue<ReturnReceiptMetrics>;
  readonly confirmedReturnDisposition: ReportValue<ConfirmedReturnDispositionMetrics>;
  readonly netRevenue: ReportValue<string>;
  readonly reversalAmount: ReportValue<string>;
  readonly fiscalTotal: ReportValue<string>;
  readonly blackStoreModuleState: ReportValue<ReportModuleState>;
  readonly blackStoreRegistration: ReportValue<BlackStoreRegistrationReport>;
  readonly blackStoreOperations: ReportValue<BlackStoreOperationDiagnostics>;
  readonly blackStoreCatalogToken: ReportValue<string>;
  readonly blackStoreCurrentStock: ReportValue<BlackStoreCurrentStockReport>;
  readonly blackStoreRemoteFreshness: ReportValue<string>;
  readonly blackStoreSales: ReportValue<string>;
  readonly blackStoreRevenue: ReportValue<string>;
  readonly blackStorePayments: ReportValue<string>;
  readonly blackStoreReturns: ReportValue<string>;
  readonly blackStoreMonetaryChannelMix: ReportValue<string>;
  readonly blackStoreHistoricalStock: ReportValue<string>;
  readonly blackStoreSynchronization: ReportValue<string>;
}

export interface ChannelReport { readonly contractVersion: 'storecore-channel-report-v1'; readonly period: ReportPeriod; readonly metrics: ChannelReportMetrics; }

export abstract class ChannelReportRepository {
  abstract read(query: ReportPeriodQuery): Observable<ChannelReport>;
  abstract export(query: ReportExportQuery): Observable<ReportExportFile>;
}
