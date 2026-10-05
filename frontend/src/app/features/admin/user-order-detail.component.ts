import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
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
      (retry)="reload()"
    />
  `,
})
export class UserOrderDetailComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  constructor(
    readonly store: UserOrderDetailStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(
      map((params) => params.get('id') ?? ''),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((id) => this.store.load(id));
  }

  reload(): void {
    this.store.load(this.route.snapshot.paramMap.get('id') ?? '');
  }
}
