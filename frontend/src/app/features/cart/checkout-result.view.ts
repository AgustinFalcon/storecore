import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerOrder } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { CustomerOrderRefreshPhase } from '../orders/customer-order-refresh';

@Component({
  selector: 'sc-checkout-result-view',
  imports: [RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-result.view.html',
})
export class CheckoutResultViewComponent {
  readonly Phase = CustomerOrderRefreshPhase;
  @Input() order: CustomerOrder | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Input() refreshPhase = CustomerOrderRefreshPhase.Idle;
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly refresh = new EventEmitter<void>();
}
