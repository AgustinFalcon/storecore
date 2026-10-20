import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CartStore } from '../cart/cart.store';
import { CatalogStore } from './catalog.store';
import { ProductPageViewComponent } from './product-page.view';

@Component({
  selector: 'sc-product-page',
  imports: [AsyncPipe, ProductPageViewComponent],
  providers: [CatalogStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-product-page-view
      [product]="store.product$ | async"
      [cart]="cart.cart$ | async"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) || (cart.errorMessage$ | async) || ''"
      [access]="cart.authority()"
      (selectCustomer)="cart.selectCustomer()"
      (add)="cart.add($event)"
      (retry)="reload()"
    />
  `,
})
export class ProductPageComponent implements OnInit {
  constructor(
    readonly store: CatalogStore,
    readonly cart: CartStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.store.loadProduct(this.route.snapshot.paramMap.get('sku') ?? '');
    if (this.cart.authority().canMutate) {
      this.cart.load();
    }
  }
}
