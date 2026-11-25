import { DOCUMENT } from '@angular/common';
import { afterRenderEffect, ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CalendarHttpRepository } from '../../data/commercial-calendar/calendar-http.repository';
import { CalendarLoadState, CalendarRepository, CalendarUuid } from '../../domain/commercial-calendar/calendar';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { CalendarCenterStore } from './calendar-center.store';
import { CalendarCenterViewComponent } from './calendar-center.view';
import { CalendarUrl } from './calendar-url';
@Component({ selector: 'sc-calendar-center', imports: [CalendarCenterViewComponent], providers: [CalendarCenterStore, { provide: CalendarRepository, useExisting: CalendarHttpRepository }], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<sc-calendar-center-view [state]="store.vm()" [admin]="admin()" (filters)="apply($event)" (reload)="store.load()" (page)="page($event)" />` })
export class CalendarCenterComponent {
  readonly store = inject(CalendarCenterStore);
  private readonly session = inject(UserSession);
  readonly admin = () => this.session.roles().includes(UserRole.Admin);
  private readonly router = inject(Router);
  constructor() {
    const route = inject(ActivatedRoute), document = inject(DOCUMENT); let restored = false;
    route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(params => this.store.load(CalendarUrl.fromWire(Object.fromEntries(params.keys.map(key => [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)])))));
    afterRenderEffect(() => { const state = this.store.vm(), fragment = route.snapshot.fragment; if (restored || !fragment || !state.page || state.status !== CalendarLoadState.Ready) return; const id = CalendarUuid.fromWire(fragment.replace(/^event-/, '')); if (!id) return; const element = document.querySelector<HTMLElement>(`[data-calendar-event="${id.wire}"]`); if (element) { element.focus(); restored = true; } });
  }
  apply(raw: Record<string, string>): void { void this.router.navigate([], { queryParams: { ...raw, page: '0' } }); }
  page(delta: number): void { const state = this.store.vm(); if (!state.url.valid || !state.page || [CalendarLoadState.Loading, CalendarLoadState.Refreshing].includes(state.status) || delta < 0 && state.url.query.page === 0 || delta > 0 && !state.page.hasMore) return; void this.router.navigate([], { queryParams: { ...state.url.toWire(), page: String(state.url.query.page + delta) } }); }
}
