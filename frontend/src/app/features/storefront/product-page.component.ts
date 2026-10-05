import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
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
      [signedIn]="session.authenticated()"
      [favorite]="favorites.ids().includes((store.product$ | async)?.sku ?? '')"
      (add)="cart.add($event)"
      (toggleFavorite)="favorites.toggle($event)"
      (retry)="reload()"
    />
  `,
})
export class ProductPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  constructor(
    readonly store: CatalogStore,
    readonly cart: CartStore,
    readonly session: CustomerSession,
    readonly favorites: FavoritesBrowserStore,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(
      map((params) => params.get('sku') ?? ''),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((sku) => this.loadProduct(sku));
  }

  reload(): void {
    this.loadProduct(this.route.snapshot.paramMap.get('sku') ?? '');
  }

  private loadProduct(sku: string): void {
    this.store.loadProduct(sku);
    if (this.session.authenticated()) {
      this.cart.load();
    }
  }
}
