import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CustomerSession } from '../../core/auth/customer-session';
import { FavoritesBrowserStore } from '../../core/favorites/favorites-browser.store';
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
      [notice]="(cart.notice$ | async) ?? ''"
      [signedIn]="session.authenticated()"
      [favorite]="favorites.ids().includes((store.product$ | async)?.sku ?? '')"
      (add)="cart.add($event)"
      (toggleFavorite)="favorites.toggle($event)"
      (retry)="reload()"
    />
  `,
})
export class ProductPageComponent implements OnInit {
  constructor(
    readonly store: CatalogStore,
    readonly cart: CartStore,
    readonly session: CustomerSession,
    readonly favorites: FavoritesBrowserStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.store.loadProduct(this.route.snapshot.paramMap.get('sku') ?? '');
    if (this.session.authenticated()) {
      this.cart.load();
    }
  }
}
