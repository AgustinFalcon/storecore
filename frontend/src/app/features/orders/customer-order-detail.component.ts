import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { CustomerOrderDetailViewComponent } from './customer-order-detail.view';
import { CustomerOrderDetailStore } from './customer-order-detail.store';

@Component({
  selector: 'sc-customer-order-detail',
  imports: [AsyncPipe, CustomerOrderDetailViewComponent],
  providers: [CustomerOrderDetailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-customer-order-detail-view
      [order]="store.order$ | async"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (retry)="reload()"
    />
  `,
})
export class CustomerOrderDetailComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  constructor(
    readonly store: CustomerOrderDetailStore,
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
