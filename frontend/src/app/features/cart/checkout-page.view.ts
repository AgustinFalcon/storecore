import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CartState } from './cart.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-checkout-page-view',
  imports: [FormsModule, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-page.view.html',
})
export class CheckoutPageViewComponent {
  @Input({ required: true }) state!: CartState;
  @Output() readonly addressChange = new EventEmitter<string>();
  @Output() readonly currencyChange = new EventEmitter<string>();
  @Output() readonly pay = new EventEmitter<void>();

  get canPay(): boolean {
    return !this.state.loading && this.state.cart.lines.length > 0 && this.state.addressId.length > 0 && this.state.currency.length > 0;
  }
}
