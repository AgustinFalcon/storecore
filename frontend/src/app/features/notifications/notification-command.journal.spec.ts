import { NotificationCommandFamily, NotificationCommandJournal } from './notification-command.journal';
import { NotificationReason, NotificationRevision } from '../../domain/notification/notification';
import { EmailOperation, NotificationCategory, NotificationSeverity, NotificationStep } from '../../domain/notification/notification-types';
import { notificationFixtureActor, notificationFixtureId } from '../../data/notification/notification.fixtures';
describe('notification command recovery journal', () => {
  beforeEach(() => sessionStorage.clear());
  it('recovers exact lifecycle reason, key and revision and fences another command', () => {
    const journal = new NotificationCommandJournal();
    const command = { commandId: '33333333-3333-4333-8333-333333333333', alertId: notificationFixtureId, operation: NotificationStep.Acknowledge, expectedRevision: NotificationRevision.fromWire('9007199254740993'), reason: NotificationReason.fromWire(' Motivo ') };
    const pending = { family: NotificationCommandFamily.Lifecycle, lifecycle: command, email: null };
    expect(journal.begin('epoch', notificationFixtureActor, pending)).toBe(true);
    expect(journal.begin('epoch', notificationFixtureActor, pending)).toBe(false);
    const restored = new NotificationCommandJournal().recover('epoch', notificationFixtureActor).pending!.lifecycle!;
    expect(restored.reason.wire).toBe('Motivo'); expect(restored.commandId).toBe(command.commandId); expect(restored.expectedRevision.wire).toBe('9007199254740993');
    journal.release('epoch', notificationFixtureActor, 'foreign'); expect(journal.recover('epoch', notificationFixtureActor).locked).toBe(true);
    journal.release('epoch', notificationFixtureActor, command.commandId); expect(journal.recover('epoch', notificationFixtureActor).locked).toBe(false);
  });
  it('recovers exact preference filters and clears another actor/epoch without exposing prior content', () => {
    const journal = new NotificationCommandJournal(), command = { commandId: '33333333-3333-4333-8333-333333333333', operation: EmailOperation.Enable, expectedRevision: NotificationRevision.fromWire('0'), categories: [NotificationCategory.Stock], severities: [NotificationSeverity.Critical] };
    expect(journal.begin('epoch', notificationFixtureActor, { family: NotificationCommandFamily.Email, email: command, lifecycle: null })).toBe(true);
    expect(journal.recover('epoch', notificationFixtureActor).pending!.email!.categories).toEqual(command.categories);
    expect(journal.recover('next', notificationFixtureActor)).toEqual({ locked: false, pending: null });
  });
  it('retains a conservative fence for malformed storage', () => {
    sessionStorage.setItem('sc:notification-command:v1', '{bad');
    expect(new NotificationCommandJournal().recover('epoch', notificationFixtureActor)).toEqual({ locked: true, pending: null });
  });
});
