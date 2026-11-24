import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NotificationHttpRepository, NOTIFICATION_REPOSITORY } from '../../data/notification/notification-http.repository';
import { NotificationQuery } from '../../domain/notification/notification';
import { EmailOperation, NotificationCategory, NotificationLoadState, NotificationSeverity } from '../../domain/notification/notification-types';
import { NotificationCenterStore } from './notification-center.store';
import { NotificationCenterViewComponent } from './notification-center.view';
@Component({
  selector: 'sc-notification-center', imports: [NotificationCenterViewComponent],
  providers: [NotificationCenterStore, { provide: NOTIFICATION_REPOSITORY, useExisting: NotificationHttpRepository }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<sc-notification-center-view [state]="store.vm()" [draft]="draft()" (filters)="apply($event)" (reload)="store.load()" (preferenceReload)="store.loadPreference()" (page)="page($event)" (email)="save($event)" (recover)="store.recoverPreference()" />`,
})
export class NotificationCenterComponent {
  readonly store = inject(NotificationCenterStore);
  readonly draft = signal<Record<string, string>>({});
  private readonly router = inject(Router);
  constructor() {
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(params => {
      const raw = Object.fromEntries(params.keys.map(key => [key, params.getAll(key).length === 1 ? params.get(key)! : params.getAll(key)]));
      const query = NotificationQuery.fromWire(raw); this.draft.set(query.valid ? query.toWire() : {}); this.store.load(query);
    });
  }
  apply(raw: Record<string, string>): void { void this.router.navigate([], { queryParams: { ...raw, page: '0' } }); }
  page(delta: number): void { const state = this.store.vm(); if (!state.query.valid || state.status === NotificationLoadState.Loading || !state.page || delta < 0 && state.query.page === 0 || delta > 0 && !state.page.hasMore) return; void this.router.navigate([], { queryParams: { ...state.query.toWire(), page: String(state.query.page + delta) } }); }
  save(value: { operation: EmailOperation; categories: readonly NotificationCategory[]; severities: readonly NotificationSeverity[] }): void { this.store.savePreference(value.operation, value.categories, value.severities); }
}
