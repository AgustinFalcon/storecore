import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { CartStore } from '../cart/cart.store';
import { CatalogStore } from './catalog.store';
import { ProductPageViewComponent } from './product-page.view';
import { CustomerFavoritesStore } from '../identity/customer-favorites.store';

@Component({
  selector: 'sc-product-page',
  imports: [AsyncPipe, ProductPageViewComponent],
  providers: [CatalogStore, CustomerFavoritesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sc-product-page-view
      [product]="store.product$ | async"
      [cart]="cart.cart$ | async"
      [loading]="(store.loading$ | async) ?? false"
      [error]="(store.errorMessage$ | async) || (cart.errorMessage$ | async) || (favorites.errorMessage$ | async) || ''"
      [access]="cart.authority()"
      [favorite]="favorites.isFavorite((store.product$ | async)?.sku || '')"
      [favoriteBusy]="((favorites.viewState$ | async)?.mutationSku || '') === ((store.product$ | async)?.sku || '')"
      [favoriteFeedback]="(favorites.feedback$ | async) || ''"
      (selectCustomer)="cart.selectCustomer()"
      (add)="cart.add($event)"
      (toggleFavorite)="toggleFavorite($event)"
      (retry)="reload()"
    />
  `,
})
export class ProductPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  constructor(
    readonly store: CatalogStore,
    readonly cart: CartStore,
    readonly favorites: CustomerFavoritesStore,
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
    if (this.cart.authority().canMutate) {
      this.cart.load();
      this.favorites.load();
    }
  }

  toggleFavorite(sku: string): void {
    if (!this.cart.authority().canMutate) return;
    if (this.favorites.isFavorite(sku)) this.favorites.remove(sku);
    else this.favorites.add(sku);
  }
}
