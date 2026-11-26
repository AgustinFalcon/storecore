const unavailable = () => ({ availability: 'UNAVAILABLE', reason: 'NO_EVIDENCE' });
const unsupported = () => ({ availability: 'NOT_AVAILABLE', reason: 'UNSUPPORTED_CONTRACT' });
const reversalUnavailable = () => ({ availability: 'NOT_AVAILABLE', reason: 'REVERSAL_AMOUNT_UNAVAILABLE' });

export function reportEnvelopeFixture(): Record<string, unknown> {
  const period = {
    fromDate: '2026-11-01', toDateExclusive: '2026-11-26', timezone: 'America/Argentina/Buenos_Aires',
    fromInclusive: '2026-11-01T03:00:00Z', toExclusive: '2026-11-26T03:00:00Z', generatedAt: '2026-11-26T12:00:00Z', periodToken: 'a'.repeat(64),
  };
  return {
    code: 200, message: 'OK', errorCode: null, retryable: false, traceId: null,
    data: {
      contractVersion: 'storecore-channel-report-v1', period,
      metrics: {
        createdOrders: { availability: 'AVAILABLE', value: { count: '2', nominalTotal: '1234.50' }, evidence: {
          source: 'STORECORE_ORDER', timeBasis: 'ORDER_CREATED', observedAt: period.generatedAt, freshness: 'CURRENT',
          fromInclusive: period.fromInclusive, toExclusive: period.toExclusive, periodToken: period.periodToken,
        } },
        appliedAccreditations: unavailable(), bestSellers: unavailable(), paymentDisposition: unavailable(),
        inventoryMovements: unavailable(), lowStock: unavailable(), returnReceipts: unavailable(), confirmedReturnDisposition: unavailable(),
        netRevenue: reversalUnavailable(), reversalAmount: reversalUnavailable(), fiscalTotal: reversalUnavailable(),
        blackStoreModuleState: unavailable(), blackStoreRegistration: unavailable(), blackStoreOperations: unavailable(),
        blackStoreCatalogToken: unavailable(), blackStoreCurrentStock: unavailable(), blackStoreRemoteFreshness: unavailable(),
        blackStoreSales: unsupported(), blackStoreRevenue: unsupported(), blackStorePayments: unsupported(), blackStoreReturns: unsupported(),
        blackStoreMonetaryChannelMix: unsupported(), blackStoreHistoricalStock: unsupported(), blackStoreSynchronization: unsupported(),
      },
    },
  };
}
