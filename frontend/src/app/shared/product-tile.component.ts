import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductSummary } from '../domain/catalog/product-summary.entity';

@Component({
  selector: 'sc-product-tile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="sc-tile">
      @if (offer) {
        <span class="sc-off">OFF</span>
      }
      <a class="sc-tile__media" [routerLink]="['/catalog', product.sku]" [attr.aria-label]="product.name">
        <span class="sc-tile__figure" aria-hidden="true"></span>
      </a>
      <div class="sc-tile__body">
        <h3>
          <a [routerLink]="['/catalog', product.sku]">{{ product.name }}</a>
        </h3>
        <p class="sc-price"><span class="sc-price__kind">Efectivo</span>{{ product.price }}</p>
      </div>
    </article>
  `,
})
export class ProductTileComponent {
  @Input({ required: true }) product!: ProductSummary;
  @Input() offer = false;
}
