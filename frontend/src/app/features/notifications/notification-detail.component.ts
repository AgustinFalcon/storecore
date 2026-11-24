import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NotificationHttpRepository, NOTIFICATION_REPOSITORY } from '../../data/notification/notification-http.repository';
import { NotificationId, NotificationQuery } from '../../domain/notification/notification';
import { UserRole } from '../../domain/user/user-role';
import { NotificationDetailStore } from './notification-detail.store';
import { NotificationDetailViewComponent } from './notification-detail.view';
@Component({
  selector: 'sc-notification-detail', imports: [NotificationDetailViewComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [NotificationDetailStore, { provide: NOTIFICATION_REPOSITORY, useExisting: NotificationHttpRepository }],
  template: `<sc-notification-detail-view [state]="store.vm()" [admin]="admin" [backQuery]="backQuery" (reload)="store.load()" (transition)="store.submit($event)" (recover)="store.recoverCommand()" />`,
})
export class NotificationDetailComponent {
  readonly store = inject(NotificationDetailStore);
  private readonly route = inject(ActivatedRoute);
  get admin(): boolean { return this.store.session.roles().includes(UserRole.Admin); }
  get backQuery(): Record<string, string> { return NotificationQuery.fromWire(this.route.snapshot.queryParams).toWire(); }
  constructor() { this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(params => this.store.load(NotificationId.fromWire(params.get('alertId')))); }
}
