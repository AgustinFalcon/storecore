import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartFailureKind, CartState } from './cart.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { AddressReadState } from '../../domain/customer/address-read-state';
import { AddressReturnTarget } from '../../domain/customer/address-return-target';
import { CheckoutAttemptState } from '../../domain/cart/checkout-attempt-state';
import { ReturnDestination } from '../../domain/access/return-destination';

@Component({
  selector: 'sc-checkout-page-view',
  imports: [FormsModule, RouterLink, FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout-page.view.html',
})
export class CheckoutPageViewComponent {
  protected readonly FailureKind = CartFailureKind;
  protected readonly AddressState = AddressReadState;
  protected readonly AttemptState = CheckoutAttemptState;
  protected readonly checkoutReturn = AddressReturnTarget.Checkout;
  protected readonly loginDestination = ReturnDestination.Checkout;
  @Input({ required: true }) state!: CartState;
  @Input() access = CustomerCartAccess.Unknown;
  @Output() readonly selectCustomer = new EventEmitter<void>();
  @Output() readonly addressChange = new EventEmitter<string>();
  @Output() readonly pay = new EventEmitter<void>();
  @Output() readonly readRetry = new EventEmitter<void>();
  @Output() readonly paymentRetry = new EventEmitter<void>();

  get merchandiseTotal():number{return this.state.cart.lines.reduce((total,line)=>total+line.effectiveUnitPrice*line.quantity,0);}
  amount(value: number): string {
    if (!this.state.cart.currency.canCheckout) return 'Importe no disponible';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: this.state.cart.currency.wire }).format(value);
  }

  get canPay(): boolean {
    return this.state.failureKind === CartFailureKind.None
      && this.state.checkoutAttemptState === CheckoutAttemptState.Idle
      && this.state.addressReadState === AddressReadState.Ready
      && this.access.canMutate && !this.state.loading && this.state.cart.lines.length > 0
      && this.state.addresses.some((address) => address.id === this.state.addressId)
      && this.state.cart.currency.canCheckout;
  }

  get canRetryCheckout(): boolean {
    return this.access.canMutate && this.state.addressReadState === AddressReadState.Ready
      && this.state.checkoutAttemptState.paymentRetry
      && this.state.addresses.some((address) => address.id === this.state.addressId)
      && this.state.cart.currency.canCheckout;
  }

  get readError(): string {
    return this.state.failureKind.readFailure ? this.state.errorMessage || this.state.failureKind.label : '';
  }

  get correctiveError(): string {
    return this.state.failureKind.readFailure ? '' : this.state.errorMessage;
  }
}
