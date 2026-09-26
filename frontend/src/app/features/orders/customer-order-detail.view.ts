import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { hasRealLineDiscount } from '../../domain/order/line-discount';
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
  @Output() readonly retry = new EventEmitter<void>();
  readonly hasRealLineDiscount = hasRealLineDiscount;
}
