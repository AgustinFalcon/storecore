import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartLine } from '../../domain/cart/cart.entity';
import { CartState } from './cart.store';
import { DialogComponent } from '../../shared/dialog.component';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-cart-page-view',
  imports: [RouterLink, FeatureStatusComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-page.view.html',
})
export class CartPageViewComponent {
  @Input({ required: true }) state!: CartState;
  @Output() readonly quantityChange = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly retry = new EventEmitter<void>();
  pendingRemove: { sku: string; name: string } | null = null;

  askQuantity(line: CartLine, quantity: number): void {
    if (quantity < 1) {
      this.pendingRemove = { sku: line.sku, name: line.name };
      return;
    }
    this.quantityChange.emit({ sku: line.sku, quantity });
  }

  confirmRemove(): void {
    if (!this.pendingRemove) {
      return;
    }
    this.quantityChange.emit({ sku: this.pendingRemove.sku, quantity: 0 });
    this.pendingRemove = null;
  }

  get total(): number {
    return this.state.cart.lines.reduce((sum, line) => sum + this.lineSubtotal(line), 0);
  }

  lineSubtotal(line: CartLine): number {
    return line.effectiveUnitPrice * line.quantity;
  }
}
