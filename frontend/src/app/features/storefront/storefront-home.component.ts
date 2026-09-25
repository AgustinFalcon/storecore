import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CatalogStore } from './catalog.store';
import { StorefrontHomeViewComponent } from './storefront-home.view';

@Component({
  selector: 'sc-storefront-home',
  imports: [AsyncPipe, StorefrontHomeViewComponent],
  providers: [CatalogStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-storefront-home-view
      [home]="store.home$ | async"
      [offers]="(store.offers$ | async) ?? []"
      [categories]="(store.categories$ | async) ?? []"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) ?? ''"
      (retry)="store.loadStorefront()"
    />
  `,
})
export class StorefrontHomeComponent implements OnInit {
  constructor(readonly store: CatalogStore) {}

  ngOnInit(): void {
    this.store.loadStorefront();
  }
}
