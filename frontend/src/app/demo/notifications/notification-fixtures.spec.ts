import { NotificationCategory, NotificationLifecycle, NotificationSeverity, NotificationSource } from '../../domain/notification/notification-types';
import { NotificationFixtures } from './notification-fixtures';

describe('notification synthetic fixtures', () => {
  it('provides a deterministic populated page and an honest empty result through the productive mapper', () => {
    const populated = NotificationFixtures.populated();
    expect(populated.items).toHaveLength(25);
    expect(populated.total).toBe(32);
    expect(populated.hasMore).toBe(true);
    expect(populated.items[0].sourceId).toBe('DEMO-001');
    expect(populated.items[24].createdAt).toBe('2026-11-24T12:24:00.000Z');
    expect(NotificationFixtures.empty()).toMatchObject({ items: [], total: 0, page: 0, size: 25, hasMore: false });
  });

  it('renders future wire vocabularies as neutral unknown values without actions', () => {
    const alert = NotificationFixtures.futureWire();
    expect(alert.severity).toBe(NotificationSeverity.Unknown);
    expect(alert.category).toBe(NotificationCategory.Unknown);
    expect(alert.lifecycle).toBe(NotificationLifecycle.Unknown);
    expect(alert.source).toBe(NotificationSource.Unknown);
    expect(alert.operations).toEqual([]);
  });

  it('keeps consent separate from productive email readiness', () => {
    const preference = NotificationFixtures.unconfiguredPreference();
    expect(preference.verified).toBe(true);
    expect(preference.preference.categories).toEqual([]);
    expect(preference.readiness.label).toContain('sin configurar');
  });
});
