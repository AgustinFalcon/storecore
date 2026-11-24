import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { NOTIFICATION_REPOSITORY } from '../../data/notification/notification-http.repository';
import { mapEmailPreferenceReceipt, mapNotificationAlert, mapNotificationPage, mapNotificationPreference, mapNotificationReceipt } from '../../data/notification/notification.mapper';
import { notificationAlertWire, notificationFixtureActor, notificationFixtureId, notificationPreferenceWire, notificationReceiptWire } from '../../data/notification/notification.fixtures';
import { LifecycleCommand, NotificationId, NotificationPage, NotificationQuery } from '../../domain/notification/notification';
import { EmailOperation, NotificationCategory, NotificationLoadState, NotificationSeverity, NotificationStep } from '../../domain/notification/notification-types';
import { UserRole } from '../../domain/user/user-role';
import { NotificationCenterStore } from './notification-center.store';
import { NotificationDetailStore } from './notification-detail.store';
import { NotificationCommandJournal } from './notification-command.journal';
function setup(role = UserRole.Admin) {
  const repository = { list: vi.fn(() => of(mapNotificationPage({ items: [notificationAlertWire()], total: 1, page: 0, size: 25, hasMore: false }))), detail: vi.fn(() => of(mapNotificationAlert(notificationAlertWire()))), preference: vi.fn(() => of(mapNotificationPreference(notificationPreferenceWire()))), submit: vi.fn<(command: LifecycleCommand) => ReturnType<Subject<ReturnType<typeof mapNotificationReceipt>>['asObservable']>>(() => new Subject()), receipt: vi.fn(() => of(mapNotificationReceipt(notificationReceiptWire()))), savePreference: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 0 }))) };
  TestBed.configureTestingModule({ providers: [NotificationCenterStore, NotificationDetailStore, { provide: NOTIFICATION_REPOSITORY, useValue: repository }] });
  const session = TestBed.inject(UserSession); session.commit({ id: notificationFixtureActor, roles: [role] }, 'csrf');
  const center = TestBed.inject(NotificationCenterStore), detail = TestBed.inject(NotificationDetailStore);
  TestBed.tick(); detail.load(NotificationId.fromWire(notificationFixtureId));
  return { repository, session, center, detail };
}
function intent(detail: NotificationDetailStore, step: NotificationStep, reason: string) {
  const alert = detail.vm().alert!;
  return { alertId: alert.id, expectedRevision: alert.revision, step, reason };
}
describe('notification actor-safe stores', () => {
  beforeEach(() => sessionStorage.clear());
  it('rejects stale responses from older URL requests and clears data on logout', () => {
    const { repository, center, session } = setup();
    const older = new Subject<NotificationPage>(), newer = new Subject<NotificationPage>();
    repository.list.mockReturnValueOnce(older).mockReturnValueOnce(newer);
    center.load(NotificationQuery.fromWire({ category: NotificationCategory.Stock.wire }));
    center.load(NotificationQuery.fromWire({ category: NotificationCategory.Order.wire }));
    newer.next(mapNotificationPage({ items: [], total: 0, page: 0, size: 25, hasMore: false }));
    older.next(mapNotificationPage({ items: [notificationAlertWire()], total: 1, page: 0, size: 25, hasMore: false }));
    expect(center.vm().status).toBe(NotificationLoadState.Empty); expect(center.vm().page!.items).toEqual([]);
    session.clear(); TestBed.tick(); expect(center.vm().page).toBeNull(); expect(center.vm().preference).toBeNull(); expect(center.vm().status).toBe(NotificationLoadState.Denied);
  });
  it('reports stale only for the same filter snapshot and rejects invalid filters before HTTP', () => {
    const { repository, center } = setup(); repository.list.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    center.load(); expect(center.vm().status).toBe(NotificationLoadState.Stale);
    center.load(NotificationQuery.fromWire({ category: NotificationCategory.Order.wire })); expect(center.vm().status).toBe(NotificationLoadState.Error); expect(center.vm().page).toBeNull();
    const count = repository.list.mock.calls.length; center.load(NotificationQuery.fromWire({ severity: 'future' })); expect(repository.list).toHaveBeenCalledTimes(count); expect(center.vm().status).toBe(NotificationLoadState.Invalid);
  });
  it('allows OPERATOR self preference, while lifecycle stays read-only', () => {
    const { repository, center, detail } = setup(UserRole.Operator);
    detail.submit(intent(detail, NotificationStep.Acknowledge, 'motivo')); expect(repository.submit).not.toHaveBeenCalled();
    center.savePreference(EmailOperation.Enable, [NotificationCategory.Stock], [NotificationSeverity.Warning]); expect(repository.savePreference).toHaveBeenCalledTimes(1);
    expect(center.vm().recovery.locked).toBe(true);
  });
  it('journals before dispatch, prevents overlaps and recovers exact lifecycle command after a lost response', () => {
    const { repository, detail, session } = setup();
    repository.submit.mockImplementation(command => {
      expect(TestBed.inject(NotificationCommandJournal).recover(session.authenticationEpoch(), notificationFixtureActor).pending!.lifecycle!.commandId).toBe(command.commandId);
      return throwError(() => new HttpErrorResponse({ status: 0 }));
    });
    detail.submit(intent(detail, NotificationStep.Acknowledge, ' Motivo original ')); detail.submit(intent(detail, NotificationStep.Resolve, 'otro'));
    expect(repository.submit).toHaveBeenCalledTimes(1);
    const original = repository.submit.mock.calls[0][0];
    repository.receipt.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    detail.recoverCommand(); expect(repository.submit).toHaveBeenCalledTimes(2); expect(repository.submit.mock.calls[1][0]).toEqual(original);
    expect(detail.vm().recovery.locked).toBe(true);
  });
  it('uses matching historical receipt only to unlock and then reloads current detail', () => {
    const { repository, detail } = setup();
    repository.submit.mockImplementation(command => of(mapNotificationReceipt(notificationReceiptWire({ commandId: command.commandId, reason: command.reason.wire }))));
    detail.submit(intent(detail, NotificationStep.Acknowledge, 'Motivo'));
    expect(detail.vm().recovery.locked).toBe(false); expect(detail.vm().receipt!.after!.revision.wire).toBe('9007199254740994'); expect(detail.vm().alert!.revision.wire).toBe('9007199254740993');
  });
  it('refuses old actor actions and publications before the identity effect flushes', () => {
    const { repository, session, detail, center } = setup();
    const oldResponse = new Subject<NotificationPage>(), currentResponse = new Subject<NotificationPage>();
    repository.list.mockReturnValueOnce(oldResponse).mockReturnValueOnce(currentResponse); center.load();
    session.commit({ id: '44444444-4444-4444-8444-444444444444', roles: [UserRole.Admin] }, 'new-csrf');
    detail.submit(intent(detail, NotificationStep.Acknowledge, 'No debe salir')); center.savePreference(EmailOperation.Enable, [NotificationCategory.Stock], [NotificationSeverity.Warning]);
    expect(repository.submit).not.toHaveBeenCalled(); expect(repository.savePreference).not.toHaveBeenCalled();
    oldResponse.next(mapNotificationPage({ items: [], total: 0, page: 0, size: 25, hasMore: false }));
    expect(center.vm().status).toBe(NotificationLoadState.Loading);
    TestBed.tick(); expect(center.vm().page).toBeNull();
    currentResponse.next(mapNotificationPage({ items: [], total: 0, page: 0, size: 25, hasMore: false }));
    expect(center.vm().page!.items).toEqual([]);
  });
  it('does not settle the persisted intent from a response after store destruction', () => {
    const { repository, session, detail } = setup(), response = new Subject<ReturnType<typeof mapNotificationReceipt>>();
    repository.submit.mockReturnValue(response); detail.submit(intent(detail, NotificationStep.Acknowledge, 'Motivo'));
    const command = repository.submit.mock.calls[0][0]; detail.ngOnDestroy();
    response.next(mapNotificationReceipt(notificationReceiptWire({ commandId: command.commandId, reason: command.reason.wire })));
    expect(TestBed.inject(NotificationCommandJournal).recover(session.authenticationEpoch(), notificationFixtureActor).locked).toBe(true);
    const recreated = TestBed.runInInjectionContext(() => new NotificationDetailStore(repository, session, TestBed.inject(NotificationCommandJournal)));
    TestBed.tick(); recreated.load(NotificationId.fromWire(notificationFixtureId));
    expect(recreated.vm().recovery.pending!.lifecycle!.commandId).toBe(command.commandId); recreated.ngOnDestroy();
  });
  it('replays the exact email command and preserves the fence for mismatched receipts', () => {
    const { repository, center } = setup(); center.savePreference(EmailOperation.Enable, [NotificationCategory.Stock], [NotificationSeverity.Warning]);
    const first = repository.savePreference.mock.calls[0]; center.recoverPreference(); expect(repository.savePreference.mock.calls[1]).toEqual(first);
    repository.savePreference.mockReturnValue(of(mapEmailPreferenceReceipt({ commandId: '99999999-9999-4999-8999-999999999999', outcome: 'APPLIED', preference: notificationPreferenceWire().preference, recordedAt: '2026-11-24T12:00:00Z' })) as never);
    center.recoverPreference(); expect(center.vm().recovery.locked).toBe(true);
  });
  it('rejects a reviewed transition when the alert revision changed before confirmation', () => {
    const { repository, detail } = setup();
    const reviewed = intent(detail, NotificationStep.Resolve, 'Resolver revisión original');
    repository.detail.mockReturnValue(of(mapNotificationAlert(notificationAlertWire({ revision: '9007199254740994' }))));
    detail.load();
    detail.submit(reviewed);
    expect(repository.submit).not.toHaveBeenCalled();
    expect(detail.vm().message).toContain('cambió desde la revisión');
  });
});
