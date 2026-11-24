import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { EmailPreferenceCommand, EmailPreferenceReceipt, LifecycleCommand, NotificationAlert, NotificationPage, NotificationPreferenceView, NotificationQuery, NotificationReceipt, NotificationRepository } from '../../domain/notification/notification';
import { EmailOperation } from '../../domain/notification/notification-types';
import { mapEmailPreferenceReceipt, mapNotificationAlert, mapNotificationPage, mapNotificationPreference, mapNotificationReceipt } from './notification.mapper';
export const NOTIFICATION_REPOSITORY = new InjectionToken<NotificationRepository>('NotificationRepository');
@Injectable({ providedIn: 'root' })
export class NotificationHttpRepository implements NotificationRepository {
  private readonly base = `${environment.apiBaseUrl}/user/notifications`;
  constructor(private readonly http: HttpClient) {}
  list(query: NotificationQuery): Observable<NotificationPage> { return this.http.get<unknown>(this.base, { params: new HttpParams({ fromObject: query.toWire() }) }).pipe(map(body => { const page = mapNotificationPage(readApiBody(body)); if (page.page !== query.page || page.size !== query.size) throw new Error('Página no corresponde a la consulta'); return page; })); }
  detail(id: string): Observable<NotificationAlert> { return this.http.get<unknown>(`${this.base}/${encodeURIComponent(id)}`).pipe(map(body => { const alert = mapNotificationAlert(readApiBody(body)); if (alert.id.wire !== id) throw new Error('La alerta no corresponde a la consulta'); return alert; })); }
  submit(command: LifecycleCommand): Observable<NotificationReceipt> { return this.post(`${this.base}/${encodeURIComponent(command.alertId)}/commands`, command.commandId, { operation: command.operation.wire, expectedRevision: command.expectedRevision.wire, reason: command.reason.wire }, mapNotificationReceipt); }
  receipt(command: LifecycleCommand): Observable<NotificationReceipt> { return this.http.get<unknown>(`${this.base}/${encodeURIComponent(command.alertId)}/commands/${encodeURIComponent(command.commandId)}`).pipe(map(body => mapNotificationReceipt(readApiBody(body)))); }
  preference(): Observable<NotificationPreferenceView> { return this.http.get<unknown>(`${this.base}/email-preferences`).pipe(map(body => mapNotificationPreference(readApiBody(body)))); }
  savePreference(command: EmailPreferenceCommand): Observable<EmailPreferenceReceipt> {
    const payload = { operation: command.operation.wire, expectedRevision: command.expectedRevision.wire, ...(command.operation === EmailOperation.Enable ? { categories: command.categories.map(x => x.wire), severities: command.severities.map(x => x.wire) } : {}) };
    return this.post(`${this.base}/email-preferences/commands`, command.commandId, payload, mapEmailPreferenceReceipt);
  }
  private post<T>(url: string, key: string, payload: unknown, mapper: (raw: unknown) => T): Observable<T> {
    return this.http.post<unknown>(url, payload, { headers: { 'Idempotency-Key': key } }).pipe(map(body => mapper(readApiBody(body))), catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        const envelope = error.error as { data?: unknown } | null;
        if (envelope?.data) { try { return of(mapper(envelope.data)); } catch { /* Untrusted receipt keeps the command uncertain. */ } }
      }
      return throwError(() => error);
    }));
  }
}
