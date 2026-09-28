import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CartLine } from '../../domain/cart/cart.entity';
import { orderStatusLabel, paymentStatusLabel } from '../../domain/order/status-label';
import { quoteShipping, shippingPrice } from '../../domain/shipping/shipping-quote';
import { CartState } from './cart.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { DialogComponent } from '../../shared/dialog.component';

@Component({
  selector: 'sc-checkout-page-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-page.view.html',
})
export class CheckoutPageViewComponent {
  @Input({ required: true }) state!: CartState;
  @Output() readonly addressChange = new EventEmitter<string>();
  @Output() readonly currencyChange = new EventEmitter<string>();
  @Output() readonly paymentMethodChange = new EventEmitter<string>();
  @Output() readonly pay = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
  confirming = false;

  readonly orderStatusLabel = orderStatusLabel;
  readonly paymentStatusLabel = paymentStatusLabel;

  get canPay(): boolean {
    return !this.state.loading && this.state.cart.lines.length > 0 && this.state.addressId.length > 0 && this.state.currency.length > 0;
  }

  get total(): number {
    return this.state.cart.lines.reduce((sum, line) => sum + this.lineSubtotal(line), 0);
  }

  lineSubtotal(line: CartLine): number {
    return line.effectiveUnitPrice * line.quantity;
  }

  get shippingAmount(): number {
    return shippingPrice(this.total, this.state.shippingOptionId);
  }

  get shippingName(): string {
    return quoteShipping(this.total).find((option) => option.id === this.state.shippingOptionId)?.name ?? '';
  }

  get simulatedTotal(): number {
    return this.total + this.shippingAmount;
  }

  get payLabel(): string {
    return this.state.paymentMethod === 'CASH' ? 'Registrar pago en efectivo' : 'Pagar con Mercado Pago';
  }

  askPay(): void {
    if (this.canPay) {
      this.confirming = true;
    }
  }

  confirmPay(): void {
    this.confirming = false;
    this.pay.emit();
  }
}
