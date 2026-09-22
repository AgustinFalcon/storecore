import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FavoritesMemory } from '../../core/shopper/favorites-memory';
import { Cart } from '../../domain/cart/cart.entity';
import { ProductDetail } from '../../domain/catalog/product-detail.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-product-page-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-page.view.html',
})
export class ProductPageViewComponent {
  @Input() product: ProductDetail | null = null;
  @Input() cart: Cart | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Input() signedIn = false;
  quantity = 1;
  activeImage = '';

  constructor(readonly favorites: FavoritesMemory) {}

  @Output() readonly add = new EventEmitter<{ sku: string; quantity: number }>();

  changeQty(delta: number): void {
    this.quantity = Math.max(1, Number(this.quantity) + delta);
  }

  submit(sku: string): void {
    this.add.emit({ sku, quantity: Math.max(1, Number(this.quantity) || 1) });
  }
}
