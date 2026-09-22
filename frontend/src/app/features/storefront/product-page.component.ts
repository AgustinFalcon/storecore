import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CustomerSession } from '../../core/auth/customer-session';
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
      [signedIn]="session.authenticated()"
      (add)="cart.add($event)"
    />
  `,
})
export class ProductPageComponent implements OnInit {
  constructor(
    readonly store: CatalogStore,
    readonly cart: CartStore,
    readonly session: CustomerSession,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.store.loadProduct(this.route.snapshot.paramMap.get('sku') ?? '');
    if (this.session.authenticated()) {
      this.cart.load();
    }
  }
}
