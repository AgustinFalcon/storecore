import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UserOrderDetailViewComponent } from './user-order-detail.view';
import { UserOrderDetailStore } from './user-order-detail.store';

@Component({
  selector: 'sc-user-order-detail',
  imports: [AsyncPipe, UserOrderDetailViewComponent],
  providers: [UserOrderDetailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-user-order-detail-view
      [order]="store.order$ | async"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (ship)="store.ship($event)"
      (rma)="store.rma($event)"
    />
  `,
})
export class UserOrderDetailComponent implements OnInit {
  constructor(
    readonly store: UserOrderDetailStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.store.load(this.route.snapshot.paramMap.get('id') ?? '');
  }
}
