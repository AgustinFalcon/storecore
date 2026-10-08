import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartLine } from '../../domain/cart/cart.entity';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartState } from './cart.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-cart-page-view',
  imports: [RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-page.view.html',
})
export class CartPageViewComponent {
  @Input({ required: true }) state!: CartState;
  @Input() access = CustomerCartAccess.Unknown;
  @Output() readonly selectCustomer = new EventEmitter<void>();
  @Output() readonly quantityChange = new EventEmitter<{ sku: string; quantity: number }>();
  @Output() readonly retry = new EventEmitter<void>();

  get total(): number {
    return this.state.cart.lines.reduce((sum, line) => sum + this.lineSubtotal(line), 0);
  }

  lineSubtotal(line: CartLine): number {
    return line.effectiveUnitPrice * line.quantity;
  }
}
