import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationCenterViewComponent } from './notification-center.view';
import { NotificationDetailViewComponent } from './notification-detail.view';
import { NotificationQuery, NotificationId } from '../../domain/notification/notification';
import { NotificationLoadState, NotificationStep } from '../../domain/notification/notification-types';

import { mapNotificationAlert, mapNotificationPage, mapNotificationPreference } from '../../data/notification/notification.mapper';
import { notificationAlertWire, notificationFixtureId, notificationPreferenceWire } from '../../data/notification/notification.fixtures';
describe('notification presentational surfaces', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  it('shows loading, paginated populated and empty states with mounted controls', () => {
    const fixture = TestBed.createComponent(NotificationCenterViewComponent);
    const state = { status: NotificationLoadState.Loading, query: NotificationQuery.fromWire({}), page: null, preference: mapNotificationPreference(notificationPreferenceWire()), preferenceStatus: NotificationLoadState.Ready, busy: false, recovery: { locked: false, pending: null }, message: '' };
    fixture.componentRef.setInput('state', state); fixture.componentRef.setInput('draft', {}); fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const previous = element.querySelector('nav button'); expect(previous).not.toBeNull();
    expect(element.textContent).toContain(NotificationLoadState.Loading.label); expect(element.textContent).toContain('Correo sin configurar');
    fixture.componentRef.setInput('state', { ...state, page: mapNotificationPage({ items: Array.from({ length: 25 }, () => notificationAlertWire()), total: 32, page: 0, size: 25, hasMore: true }), status: NotificationLoadState.Ready }); fixture.detectChanges();
    expect(element.querySelectorAll('.notification-list li')).toHaveLength(25); expect(element.querySelector('nav button')).toBe(previous);
    fixture.componentRef.setInput('state', { ...state, page: mapNotificationPage({ items: [], total: 0, page: 0, size: 25, hasMore: false }), status: NotificationLoadState.Empty }); fixture.detectChanges();
    expect(element.textContent).toContain(NotificationLoadState.Empty.label); expect(element.querySelector('nav button')).toBe(previous);
  });
  it('does not replace server empty semantics while filters are edited but unapplied', () => {
    const fixture = TestBed.createComponent(NotificationCenterViewComponent);
    fixture.componentRef.setInput('state', { status: NotificationLoadState.Ready, query: NotificationQuery.fromWire({}), page: mapNotificationPage({ items: Array.from({ length: 25 }, () => notificationAlertWire()), total: 32, page: 0, size: 25, hasMore: true }), preference: null, preferenceStatus: NotificationLoadState.Error, busy: false, recovery: { locked: false, pending: null }, message: '' }); fixture.componentRef.setInput('draft', {}); fixture.detectChanges();
    fixture.componentInstance.edit('category', 'ORDER'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Filtros modificados sin aplicar'); expect(fixture.nativeElement.querySelectorAll('.notification-list li')).toHaveLength(25);
  });
  it('hydrates the email controls from the authoritative preference revision', () => {
    const fixture = TestBed.createComponent(NotificationCenterViewComponent);
    const preference = mapNotificationPreference({
      preference: { state: 'ENABLED', revision: '7', categories: ['STOCK'], severities: ['CRITICAL'], boundEmailVersion: '3' },
      verified: true,
      readiness: 'UNCONFIGURED',
    });
    fixture.componentRef.setInput('state', { status: NotificationLoadState.Ready, query: NotificationQuery.fromWire({}), page: mapNotificationPage({ items: [], total: 0, page: 0, size: 25, hasMore: false }), preference, preferenceStatus: NotificationLoadState.Ready, busy: false, recovery: { locked: false, pending: null }, message: '' });
    fixture.componentRef.setInput('draft', {}); fixture.detectChanges(); TestBed.tick(); fixture.detectChanges();
    const checked = [...fixture.nativeElement.querySelectorAll('input[type="checkbox"]')].filter((input: Element) => (input as HTMLInputElement).checked);
    expect(checked).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Categorías actuales: Stock');
    expect(fixture.nativeElement.textContent).toContain('Severidades actuales: Crítica');
  });
  it('keeps operator detail read-only and unknown states neutral', () => {
    const fixture = TestBed.createComponent(NotificationDetailViewComponent);
    const state = { id: NotificationId.fromWire(notificationFixtureId), alert: mapNotificationAlert(notificationAlertWire({ severity: 'FUTURE', category: 'FUTURE', lifecycle: 'FUTURE', sourceType: 'FUTURE' })), status: NotificationLoadState.Ready, busy: false, recovery: { locked: false, pending: null }, receipt: null, message: '' };
    fixture.componentRef.setInput('state', state); fixture.componentRef.setInput('admin', false); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Acceso de lectura'); expect(fixture.nativeElement.textContent).not.toContain('FUTURE'); expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });
  it('reviews and explicitly confirms a typed admin transition with an immutable reason', () => {
    const fixture = TestBed.createComponent(NotificationDetailViewComponent);
    const state = { id: NotificationId.fromWire(notificationFixtureId), alert: mapNotificationAlert(notificationAlertWire()), status: NotificationLoadState.Ready, busy: false, recovery: { locked: false, pending: null }, receipt: null, message: '' };
    fixture.componentRef.setInput('state', state); fixture.componentRef.setInput('admin', true); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.notification-actions button') as HTMLButtonElement;
    expect(button.disabled).toBe(true); fixture.componentInstance.reason.set('Revisión manual'); fixture.detectChanges();
    const listener = vi.fn(); fixture.componentInstance.transition.subscribe(listener); button.click(); fixture.detectChanges();
    expect(listener).not.toHaveBeenCalled(); expect(fixture.nativeElement.textContent).toContain('Vas a cambiar la alerta a Reconocida');
    fixture.componentInstance.reason.set('Otro texto');
    (fixture.nativeElement.querySelector('.notification-confirmation button') as HTMLButtonElement).click();
    expect(listener).toHaveBeenCalledWith({ alertId: state.alert.id, expectedRevision: state.alert.revision, step: NotificationStep.Acknowledge, reason: 'Revisión manual' });
  });
  it('invalidates a pending confirmation when a refreshed snapshot changes revision', () => {
    const fixture = TestBed.createComponent(NotificationDetailViewComponent);
    const alert = mapNotificationAlert(notificationAlertWire());
    const state = { id: NotificationId.fromWire(notificationFixtureId), alert, status: NotificationLoadState.Ready, busy: false, recovery: { locked: false, pending: null }, receipt: null, message: '' };
    fixture.componentRef.setInput('state', state); fixture.componentRef.setInput('admin', true); fixture.detectChanges();
    fixture.componentInstance.reason.set('Revisión original'); fixture.componentInstance.review(NotificationStep.Resolve);
    expect(fixture.componentInstance.pending()?.expectedRevision.wire).toBe('9007199254740993');
    fixture.componentRef.setInput('state', { ...state, alert: mapNotificationAlert(notificationAlertWire({ revision: '9007199254740994' })) });
    fixture.detectChanges(); TestBed.tick();
    expect(fixture.componentInstance.pending()).toBeNull();
    expect(fixture.componentInstance.reason()).toBe('');
  });
});
