import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { hasRealLineDiscount } from '../../domain/order/line-discount';
import { CustomerOrder } from '../../domain/order/order.entity';
import { orderStatusLabel, paymentStatusLabel } from '../../domain/order/status-label';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-customer-orders-view',
  imports: [RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-orders.view.html',
})
export class CustomerOrdersViewComponent {
  @Input() orders: readonly CustomerOrder[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();
  readonly hasRealLineDiscount = hasRealLineDiscount;
  readonly orderStatusLabel = orderStatusLabel;
  readonly paymentStatusLabel = paymentStatusLabel;
}
