import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { firstOrderPage, OrderQuery } from '../../domain/order/order-projection';
import { OrderListControlsComponent } from './order-list-controls.component';

@Component({
  selector: 'sc-customer-orders-view',
  imports: [RouterLink, FeatureStatusComponent, OrderListControlsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-orders.view.html',
})
export class CustomerOrdersViewComponent {
  @Input() orders: readonly CustomerOrder[] = [];
  @Input() loading = false;
  @Input() query: OrderQuery = firstOrderPage;
  @Input() total = 0;
  @Input() truncated = false;
  @Output() readonly queryChange = new EventEmitter<OrderQuery>();
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();
}
