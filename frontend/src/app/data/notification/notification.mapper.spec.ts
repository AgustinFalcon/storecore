import { EmailReadiness, NotificationLifecycle, NotificationStep } from '../../domain/notification/notification-types';
import { mapNotificationAlert, mapNotificationPage, mapNotificationPreference, mapNotificationReceipt } from './notification.mapper';
import { notificationAlertWire, notificationPreferenceWire, notificationReceiptWire } from './notification.fixtures';
describe('notification boundary mapper', () => {
  it('preserves exact revision and intersects available operations with domain rules', () => {
    const alert = mapNotificationAlert(notificationAlertWire());
    expect(alert.revision.wire).toBe('9007199254740993'); expect(alert.operations).toEqual([NotificationStep.Acknowledge, NotificationStep.Resolve]);
    expect(mapNotificationAlert(notificationAlertWire({ lifecycle: 'RESOLVED' })).operations).toEqual([]);
  });
  it('renders unknown neutrally and removes all actions', () => {
    const alert = mapNotificationAlert(notificationAlertWire({ lifecycle: 'FUTURE' })); expect(alert.lifecycle).toBe(NotificationLifecycle.Unknown); expect(alert.operations).toEqual([]);
    expect(mapNotificationAlert(notificationAlertWire({ category: 'FUTURE' })).operations).toEqual([]);
  });
  it('validates absolute pagination continuation', () => {
    const value = { items: [notificationAlertWire()], total: 51, page: 2, size: 25, hasMore: false };
    expect(mapNotificationPage(value).hasMore).toBe(false); expect(() => mapNotificationPage({ ...value, hasMore: true })).toThrow();
  });
  it('keeps readiness separate from email preference and validates historical receipts', () => {
    expect(mapNotificationPreference(notificationPreferenceWire()).readiness).toBe(EmailReadiness.Unconfigured);
    expect(mapNotificationReceipt(notificationReceiptWire()).actorId.wire).toBe('42');
    expect(mapNotificationReceipt(notificationReceiptWire()).after?.revision.wire).toBe('9007199254740994');
    expect(() => mapNotificationReceipt(notificationReceiptWire({ actorId: '22222222-2222-4222-8222-222222222222' }))).toThrow();
    expect(() => mapNotificationReceipt(notificationReceiptWire({ outcome: 'FUTURE' }))).toThrow();
    expect(() => mapNotificationReceipt(notificationReceiptWire({ after: null }))).toThrow();
  });
});
