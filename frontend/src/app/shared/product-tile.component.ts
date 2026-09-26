import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
<<<<<<< HEAD
import { FavoritesBrowserStore } from '../core/favorites/favorites-browser.store';
=======
import { isApiOfferVisible } from '../domain/catalog/offer-window';
>>>>>>> origin/feature/storecore-offer-window-pages
import { ProductSummary } from '../domain/catalog/product-summary.entity';

@Component({
  selector: 'sc-product-tile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="sc-tile">
<<<<<<< HEAD
      @let marked = favorites.ids().includes(product.sku);
      @if (offer || product.offerRef) {
=======
      @if (showOffer) {
>>>>>>> origin/feature/storecore-offer-window-pages
        <span class="sc-off">Oferta</span>
      }
      <button
        type="button"
        class="sc-heart"
        [class.is-on]="marked"
        [attr.aria-pressed]="marked"
        [attr.aria-label]="marked ? 'Quitar de este navegador' : 'Marcar en este navegador'"
        (click)="favorites.toggle({ sku: product.sku, name: product.name })"
      >
        <span aria-hidden="true">{{ marked ? '♥' : '♡' }}</span>
      </button>
      <a class="sc-tile__media" [routerLink]="['/catalog', product.sku]" [attr.aria-label]="product.name">
        @if (product.imageUrl) {
          <img class="sc-tile__image" [src]="product.imageUrl" [alt]="product.name" />
        } @else {
          <span class="sc-tile__figure" aria-hidden="true"></span>
        }
      </a>
      <div class="sc-tile__body">
        <h3>
          <a [routerLink]="['/catalog', product.sku]">{{ product.name }}</a>
        </h3>
        <div class="sc-price-stack">
          @if (product.originalPrice !== null) {
            <p class="sc-price__was">{{ product.originalPrice }}</p>
          }
          <p class="sc-price"><span class="sc-price__kind">Efectivo</span>{{ product.price }}</p>
        </div>
      </div>
    </article>
  `,
})
export class ProductTileComponent {
  @Input({ required: true }) product!: ProductSummary;
  @Input() offer = false;

<<<<<<< HEAD
  constructor(readonly favorites: FavoritesBrowserStore) {}
=======
  /** Badge only. A closed window hides it; the numeric price stays on the card. */
  get showOffer(): boolean {
    const marked = this.offer || !!this.product?.offerRef;
    return marked && isApiOfferVisible(this.product?.validFrom, this.product?.validUntil, new Date());
  }
>>>>>>> origin/feature/storecore-offer-window-pages
}
