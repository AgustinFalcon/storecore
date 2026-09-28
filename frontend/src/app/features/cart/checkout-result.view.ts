import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from '../../domain/order/status-label';
import { quoteShipping, shippingPrice } from '../../domain/shipping/shipping-quote';
import { ShippingSelection } from '../../domain/shipping/shipping.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-checkout-result-view',
  imports: [RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-result.view.html',
})
export class CheckoutResultViewComponent {
  @Input() order: CustomerOrder | null = null;
  @Input() shipping: ShippingSelection | null = null;
  @Input() shippingError = '';
  @Input() loading = false;
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();
  readonly orderStatusLabel = orderStatusLabel;
  readonly paymentStatusLabel = paymentStatusLabel;

  readonly paymentMethodLabel = paymentMethodLabel;

  get shippingName(): string {
    return quoteShipping(this.order?.total ?? 0).find((option) => option.id === this.shipping?.optionId)?.name ?? '';
  }

  get outcome(): string {
    if (this.order?.paymentStatus === 'APPROVED') {
      return 'El servidor marcó el pago acreditado. Esta pantalla no lo decide.';
    }
    if (this.order?.paymentStatus === 'REJECTED') {
      return 'El servidor marcó el pago rechazado. La orden sigue y se puede reintentar.';
    }
    const method = this.order?.paymentMethod;
    if (method === 'CASH') {
      return 'El pago sigue pendiente. El efectivo se cobra en el local. Esta pantalla no lo marca como cobrado.';
    }
    if (method === 'MERCADO_PAGO') {
      return 'El pago sigue pendiente. Mercado Pago acredita en su sitio. Esta pantalla no lo decide.';
    }
    return 'El pago sigue pendiente. Esta pantalla no elige el medio ni lo marca como cobrado.';
  }

  get shippingAmount(): number {
    return shippingPrice(this.order?.total ?? 0, this.shipping?.optionId ?? null);
  }

  get simulatedTotal(): number {
    return (this.order?.total ?? 0) + this.shippingAmount;
  }
}
