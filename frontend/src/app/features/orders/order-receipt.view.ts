import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BillingProfile } from '../../domain/billing/billing.entity';
import { paymentMethodLabel } from '../../domain/order/status-label';
import { CustomerOrder } from '../../domain/order/order.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-order-receipt-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-receipt.view.html',
})
export class OrderReceiptViewComponent {
  @Input() order: CustomerOrder | null = null;
  @Input() profile: BillingProfile | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Input() notice = '';
  @Output() readonly legalNameChange = new EventEmitter<string>();
  @Output() readonly taxIdChange = new EventEmitter<string>();
  @Output() readonly conditionChange = new EventEmitter<string>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
  readonly paymentMethodLabel = paymentMethodLabel;
}
