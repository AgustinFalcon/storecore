import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NotificationHttpRepository } from './notification-http.repository';
import { NotificationReason, NotificationRevision } from '../../domain/notification/notification';
import { EmailOperation, NotificationCategory, NotificationOutcome, NotificationSeverity, NotificationStep } from '../../domain/notification/notification-types';
import { notificationFixtureId, notificationReceiptWire } from './notification.fixtures';
describe('notification HTTP contract', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('sends only lifecycle payload fields and the exact idempotency header; maps a 409 receipt', async () => {
    const command = { commandId: '33333333-3333-4333-8333-333333333333', alertId: notificationFixtureId, operation: NotificationStep.Resolve, expectedRevision: NotificationRevision.fromWire('9007199254740993'), reason: NotificationReason.fromWire(' Revisado ') };
    const pending = firstValueFrom(TestBed.inject(NotificationHttpRepository).submit(command));
    const request = TestBed.inject(HttpTestingController).expectOne(`/api/v1/user/notifications/${notificationFixtureId}/commands`);
    expect(request.request.headers.get('Idempotency-Key')).toBe(command.commandId);
    expect(request.request.body).toEqual({ operation: NotificationStep.Resolve.wire, expectedRevision: command.expectedRevision.wire, reason: 'Revisado' });
    request.flush({ code: 409, data: notificationReceiptWire({ outcome: NotificationOutcome.RevisionConflict.wire, after: null, currentRevision: '9007199254740993' }) }, { status: 409, statusText: 'Conflict' });
    expect((await pending).outcome).toBe(NotificationOutcome.RevisionConflict);
  });
  it('DISABLE carries no filters; ENABLE uses selected operational filters, never recipient or actor', async () => {
    const repository = TestBed.inject(NotificationHttpRepository), ctrl = TestBed.inject(HttpTestingController);
    for (const operation of [EmailOperation.Enable, EmailOperation.Disable]) {
      const command = { commandId: '33333333-3333-4333-8333-333333333333', operation, expectedRevision: NotificationRevision.fromWire('0'), categories: [NotificationCategory.Stock], severities: [NotificationSeverity.Warning] };
      const pending = firstValueFrom(repository.savePreference(command)).catch(error => error);
      const request = ctrl.expectOne('/api/v1/user/notifications/email-preferences/commands');
      expect(request.request.body).toEqual({ operation: operation.wire, expectedRevision: '0', ...(operation === EmailOperation.Enable ? { categories: [NotificationCategory.Stock.wire], severities: [NotificationSeverity.Warning.wire] } : {}) });
      expect(request.request.headers.get('Idempotency-Key')).toBe(command.commandId);
      request.flush({}, { status: 503, statusText: 'Unavailable' }); await pending;
    }
  });
  it('keeps missing or malformed 409 receipts uncertain', async () => {
    const repository = TestBed.inject(NotificationHttpRepository), ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repository.savePreference({ commandId: '33333333-3333-4333-8333-333333333333', operation: EmailOperation.Disable, expectedRevision: NotificationRevision.fromWire('0'), categories: [], severities: [] })).catch(error => error);
    ctrl.expectOne('/api/v1/user/notifications/email-preferences/commands').flush({ data: { outcome: 'FUTURE' } }, { status: 409, statusText: 'Conflict' });
    expect((await pending).status).toBe(409);
  });
});
