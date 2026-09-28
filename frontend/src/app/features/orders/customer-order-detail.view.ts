import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { hasRealLineDiscount } from '../../domain/order/line-discount';
import { CustomerOrder } from '../../domain/order/order.entity';
import { orderStatusLabel, paymentStatusLabel, shipmentStatusLabel } from '../../domain/order/status-label';
import { quoteShipping, shippingPrice } from '../../domain/shipping/shipping-quote';
import { ShippingSelection } from '../../domain/shipping/shipping.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-customer-order-detail-view',
  imports: [RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-order-detail.view.html',
})
export class CustomerOrderDetailViewComponent {
  @Input() order: CustomerOrder | null = null;
  @Input() shipping: ShippingSelection | null = null;
  @Input() shippingError = '';
  @Input() loading = false;
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();
  readonly hasRealLineDiscount = hasRealLineDiscount;
  readonly orderStatusLabel = orderStatusLabel;
  readonly paymentStatusLabel = paymentStatusLabel;
  readonly shipmentStatusLabel = shipmentStatusLabel;

  get shippingName(): string {
    return quoteShipping(this.order?.total ?? 0).find((option) => option.id === this.shipping?.optionId)?.name ?? '';
  }

  get shippingAmount(): number {
    return shippingPrice(this.order?.total ?? 0, this.shipping?.optionId ?? null);
  }

  get simulatedTotal(): number {
    return (this.order?.total ?? 0) + this.shippingAmount;
  }
}
