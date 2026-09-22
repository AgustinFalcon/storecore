import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
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
}
