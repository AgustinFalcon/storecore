import {
  mapNotificationAlert,
  mapNotificationPage,
  mapNotificationPreference,
} from '../../data/notification/notification.mapper';

const categories = ['STOCK', 'ORDER', 'PAYMENT', 'RETURN', 'INTEGRATION', 'CAMPAIGN'] as const;
const severities = ['INFO', 'WARNING', 'CRITICAL'] as const;
const lifecycles = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
const sources = ['STORECORE_FACT', 'BLACKSTORE_STOCK_RECEIPT', 'SYSTEM_CAMPAIGN'] as const;

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function item(index: number): Record<string, unknown> {
  const lifecycle = lifecycles[index % lifecycles.length];
  const operations = lifecycle === 'OPEN' ? ['ACKNOWLEDGE', 'RESOLVE'] : lifecycle === 'ACKNOWLEDGED' ? ['RESOLVE'] : ['REOPEN'];
  return {
    notification: {
      id: uuid(index + 1),
      sourceType: sources[index % sources.length],
      sourceId: `DEMO-${String(index + 1).padStart(3, '0')}`,
      fingerprint: (index + 1).toString(16).padStart(64, '0'),
      category: categories[index % categories.length],
      severity: severities[index % severities.length],
      lifecycle,
      revision: String(index),
    },
    createdAt: new Date(Date.UTC(2026, 10, 24, 12, index)).toISOString(),
    availableOperations: operations,
  };
}

/** Deterministic demo wires cross the same boundary mapper as productive HTTP. */
export const NotificationFixtures = Object.freeze({
  populated: () => mapNotificationPage({ items: Array.from({ length: 25 }, (_, index) => item(index)), total: 32, page: 0, size: 25, hasMore: true }),
  empty: () => mapNotificationPage({ items: [], total: 0, page: 0, size: 25, hasMore: false }),
  futureWire: () => mapNotificationAlert({
    notification: { ...(item(0)['notification'] as object), severity: 'FUTURE', category: 'FUTURE', lifecycle: 'FUTURE', sourceType: 'FUTURE' },
    createdAt: '2026-11-24T12:00:00.000Z',
    availableOperations: ['ACKNOWLEDGE', 'FUTURE'],
  }),
  unconfiguredPreference: () => mapNotificationPreference({
    preference: { state: 'DISABLED', revision: '0', categories: [], severities: [], boundEmailVersion: null },
    verified: true,
    readiness: 'UNCONFIGURED',
  }),
});
