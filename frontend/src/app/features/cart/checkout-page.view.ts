import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartFailureKind, CartState, deliverySelectionReady } from './cart.store';
import { checkoutTotal, DeliveryMode, DeliveryQuote } from '../../domain/cart/delivery';
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
  styles: ['.delivery-options{display:grid;gap:.8rem;border:0;padding:0;margin:0 0 1.2rem;min-width:0}.delivery-option{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:.8rem;padding:1rem;border:1px solid var(--sc-color-border,#ccd3db);border-radius:.75rem;cursor:pointer;overflow-wrap:anywhere}.delivery-option:has(input:checked){border:2px solid var(--sc-color-primary,#2457a7);background:var(--sc-color-surface,#f5f8fc)}.delivery-option input{width:1.1rem;min-height:1.1rem;margin:.25rem 0}.delivery-option small,.delivery-option strong{display:block}.delivery-detail{white-space:pre-wrap;overflow-wrap:anywhere}.sc-summary dl div{display:flex;justify-content:space-between;gap:1rem}.sc-summary dd{margin:0}'],
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
  @Output() readonly deliveryChange = new EventEmitter<DeliveryMode>();
  @Output() readonly pay = new EventEmitter<void>();
  @Output() readonly readRetry = new EventEmitter<void>();
  @Output() readonly paymentRetry = new EventEmitter<void>();

  get summaryLines() { return this.state.attemptCommand ? this.state.attemptLines ?? this.state.cart.lines : this.state.cart.lines; }
  get merchandiseTotal():number{return this.summaryLines.reduce((total,line)=>total+line.effectiveUnitPrice*line.quantity,0);}
  get quote(): DeliveryQuote { return this.state.deliveryQuote ?? DeliveryQuote.Unknown; }
  get options(): readonly DeliveryQuote[] { return this.state.cart.deliveryOptions ?? []; }
  get finalTotal(): number | null { return checkoutTotal(this.summaryLines, this.quote); }
  amount(value: number): string {
    if (!this.state.cart.currency.canCheckout) return 'Importe no disponible';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: this.state.cart.currency.wire }).format(value);
  }

  get canPay(): boolean {
    return this.state.failureKind === CartFailureKind.None
      && this.state.checkoutAttemptState === CheckoutAttemptState.Idle
      && deliverySelectionReady(this.state)
      && this.access.canMutate && !this.state.loading && this.state.cart.lines.length > 0
      && this.state.cart.currency.canCheckout;
  }

  get canRetryCheckout(): boolean {
    return this.access.canMutate
      && this.state.checkoutAttemptState.paymentRetry
      && !!this.state.attemptCommand
      && this.state.cart.currency.canCheckout;
  }

  get readError(): string {
    return this.state.failureKind.readFailure ? this.state.errorMessage || this.state.failureKind.label : '';
  }

  get correctiveError(): string {
    return this.state.failureKind.readFailure ? '' : this.state.errorMessage;
  }
}
