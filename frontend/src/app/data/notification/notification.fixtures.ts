/** Deterministic synthetic wire evidence; always translated by the production mapper. */
export const notificationFixtureId = '11111111-1111-4111-8111-111111111111';
export const notificationFixtureActor = '42';
export function notificationSnapshotWire(overrides: Record<string, unknown> = {}) {
  return { id: notificationFixtureId, sourceType: 'STORECORE_FACT', sourceId: 'SYNTHETIC-STOCK-001', fingerprint: 'a'.repeat(64), category: 'STOCK', severity: 'WARNING', lifecycle: 'OPEN', revision: '9007199254740993', ...overrides };
}
export function notificationAlertWire(overrides: Record<string, unknown> = {}) { return { notification: notificationSnapshotWire(overrides), createdAt: '2026-11-24T12:00:00Z', availableOperations: ['ACKNOWLEDGE', 'RESOLVE'] }; }
export function notificationPreferenceWire() { return { preference: { state: 'DISABLED', revision: '0', categories: [], severities: [], boundEmailVersion: null }, verified: true, readiness: 'UNCONFIGURED' }; }
export function notificationReceiptWire(overrides: Record<string, unknown> = {}) { return { commandId: '33333333-3333-4333-8333-333333333333', alertId: notificationFixtureId, actorId: notificationFixtureActor, operation: 'ACKNOWLEDGE', expectedRevision: '9007199254740993', reason: 'Revisión de stock', occurredAt: '2026-11-24T12:01:00Z', outcome: 'APPLIED', before: notificationSnapshotWire(), after: notificationSnapshotWire({ lifecycle: 'ACKNOWLEDGED', revision: '9007199254740994' }), currentRevision: '9007199254740994', ...overrides }; }
