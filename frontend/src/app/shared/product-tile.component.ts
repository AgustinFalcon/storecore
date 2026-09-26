import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavoritesBrowserStore } from '../core/favorites/favorites-browser.store';
import { ProductSummary } from '../domain/catalog/product-summary.entity';

@Component({
  selector: 'sc-product-tile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="sc-tile">
      @let marked = favorites.ids().includes(product.sku);
      @if (offer || product.offerRef) {
        <span class="sc-off">Oferta</span>
      }
      <button
        type="button"
        class="sc-heart"
        [class.is-on]="marked"
        [attr.aria-pressed]="marked"
        [attr.aria-label]="marked ? 'Quitar de favoritos' : 'Agregar a favoritos'"
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

  constructor(readonly favorites: FavoritesBrowserStore) {}
}
