import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartState } from './cart.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

@Component({
  selector: 'sc-checkout-page-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-page.view.html',
})
export class CheckoutPageViewComponent {
  @Input({ required: true }) state!: CartState;
  @Input() access = CustomerCartAccess.Unknown;
  @Output() readonly selectCustomer = new EventEmitter<void>();
  @Output() readonly addressChange = new EventEmitter<string>();
  @Output() readonly currencyChange = new EventEmitter<string>();
  @Output() readonly pay = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();

  get canPay(): boolean {
    return this.access.canMutate && !this.state.loading && this.state.cart.lines.length > 0
      && this.state.addresses.some((address) => address.id === this.state.addressId) && this.state.currency.length > 0;
  }
}
