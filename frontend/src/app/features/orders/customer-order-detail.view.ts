import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { OrderFactsComponent } from './order-facts.component';

@Component({
  selector: 'sc-customer-order-detail-view',
  imports: [RouterLink, FeatureStatusComponent, OrderFactsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-order-detail.view.html',
  styles: ['.sc-pdp__crumb a { color: var(--sc-color-muted-ink); }'],
})
export class CustomerOrderDetailViewComponent {
  @Input() order: CustomerOrder | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Output() readonly retry = new EventEmitter<void>();
}
