import { HttpErrorResponse } from '@angular/common/http';
import { effect, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { takeUntil } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CalendarEvent, CalendarLoadState, CalendarPage, CalendarRepository, CalendarUseCases } from '../../domain/commercial-calendar/calendar';
import { UserRole } from '../../domain/user/user-role';
import { CalendarUrl } from './calendar-url';

export interface CalendarCenterState { readonly status: CalendarLoadState; readonly url: CalendarUrl; readonly page: CalendarPage<CalendarEvent> | null; }
@Injectable()
export class CalendarCenterStore extends ComponentStore<CalendarCenterState> {
  readonly vm = this.selectSignal(state => state);
  private readonly cases: CalendarUseCases;
  private identity = '';
  private request = 0;
  constructor(repository: CalendarRepository, private readonly session: UserSession) {
    super({ status: CalendarLoadState.Loading, url: CalendarUrl.fromWire({}), page: null });
    this.cases = new CalendarUseCases(repository);
    effect(() => { const identity = this.actor(); if (identity === this.identity) return; this.identity = identity; this.request++; this.patchState({ page: null }); this.load(); });
  }
  private actor(): string { return `${this.session.authenticationEpoch()}:${this.session.authenticated()}:${this.session.principal()?.id}:${this.session.roles().map(role => role.wire).join(',')}`; }
  load(url = this.get().url): void {
    const request = ++this.request, identity = this.identity;
    if (!this.session.authenticated() || !UserRole.hasKnownRole(this.session.roles())) { this.patchState({ url, page: null, status: CalendarLoadState.Denied }); return; }
    if (!url.valid) { this.patchState({ url, page: null, status: CalendarLoadState.Invalid }); return; }
    const same = JSON.stringify(url.query) === JSON.stringify(this.get().url.query), previous = same ? this.get().page : null;
    this.patchState({ url, page: previous, status: previous ? CalendarLoadState.Refreshing : CalendarLoadState.Loading });
    this.cases.list(url.query).pipe(takeUntil(this.destroy$)).subscribe({ next: page => { if (request === this.request && identity === this.actor()) this.patchState({ page, status: page.items.length ? CalendarLoadState.Ready : CalendarLoadState.Empty }); }, error: error => {
      if (request !== this.request || identity !== this.actor()) return;
      const denied = error instanceof HttpErrorResponse && [401, 403].includes(error.status);
      this.patchState({ page: denied ? null : previous, status: denied ? CalendarLoadState.Denied : previous ? CalendarLoadState.Stale : error instanceof HttpErrorResponse ? CalendarLoadState.Error : CalendarLoadState.Corrupt });
    } });
  }
}
