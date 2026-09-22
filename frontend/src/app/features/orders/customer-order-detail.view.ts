import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-customer-order-detail-view',
  imports: [RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-order-detail.view.html',
})
export class CustomerOrderDetailViewComponent {
  @Input() order: CustomerOrder | null = null;
  @Input() loading = false;
  @Input() error = '';
}
