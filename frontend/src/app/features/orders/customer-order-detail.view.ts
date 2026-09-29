import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { hasRealLineDiscount } from '../../domain/order/line-discount';
import { DocumentStatus, PaymentMethod, ShippingChoice } from '../../domain/order/closed-status';
import { MilestonePaint, OrderMilestone } from '../../domain/order/order-milestone';
import { orderMilestones } from '../../domain/order/order-milestones';
import { CustomerOrder } from '../../domain/order/order.entity';
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
  readonly methodLabel = PaymentMethod.labelOf;

  get milestones(): readonly OrderMilestone[] {
    if (!this.order) {
      return [];
    }
    return orderMilestones({
      payment: this.order.paymentStatus,
      method: this.order.paymentMethod,
      shipment: this.order.shipmentStatus,
      tracking: this.order.tracking,
      shipping: ShippingChoice.fromWire(this.shipping?.optionId ?? null),
      document: DocumentStatus.Unknown,
    });
  }

  get currentMilestone(): OrderMilestone | null {
    return this.milestones.find((step) => step.state === MilestonePaint.Current) ?? null;
  }

  get previousMilestone(): OrderMilestone | null {
    const current = this.milestones.findIndex((step) => step.state === MilestonePaint.Current);
    for (let index = current - 1; index >= 0; index -= 1) {
      if (this.milestones[index].state === MilestonePaint.Done) {
        return this.milestones[index];
      }
    }
    return null;
  }

  get nextMilestone(): OrderMilestone | null {
    const current = this.milestones.findIndex((step) => step.state === MilestonePaint.Current);
    return this.milestones.slice(current + 1).find((step) => step.state === MilestonePaint.Upcoming) ?? null;
  }

  lineSubtotal(quantity: number, unit: number): number {
    return quantity * unit;
  }

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
