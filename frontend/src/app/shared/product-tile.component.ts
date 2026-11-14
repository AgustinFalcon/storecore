import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogPricePresentation } from '../domain/catalog/variant-price';
import { ProductSummary } from '../domain/catalog/product-summary.entity';

@Component({
  selector: 'sc-product-tile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="sc-tile">
      @if (presentation.known && product.offerRef) {
        <span class="sc-off">Oferta</span>
      }
      <a class="sc-tile__media" [routerLink]="['/catalog', product.destinationSku || product.sku]" [attr.aria-label]="product.name">
        @if (product.imageUrl) {
          <img class="sc-tile__image" [src]="product.imageUrl" [alt]="product.name" />
        } @else {
          <span class="sc-tile__figure" aria-hidden="true"></span>
        }
      </a>
      <div class="sc-tile__body">
        <h3>
          <a [routerLink]="['/catalog', product.destinationSku || product.sku]">{{ product.name }}</a>
        </h3>
        <div class="sc-price-stack">
          @if (presentation.original !== null) {
            <p class="sc-price__was">{{ presentation.original }}</p>
          }
          <p class="sc-price"><span>{{ presentation.label }}</span> @if (presentation.known) { <span class="sc-price__kind">Efectivo</span>{{ presentation.quote?.effective }} }</p>
        </div>
      </div>
    </article>
  `,
})
export class ProductTileComponent {
  @Input({ required: true }) product!: ProductSummary;
  @Input() offer = false;
  get presentation(): CatalogPricePresentation { return this.product.presentation ?? CatalogPricePresentation.Unknown; }
}
