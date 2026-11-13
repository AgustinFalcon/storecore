import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartFailureKind, type CartState } from './cart.store';
import { CartCurrency } from '../../domain/cart/cart-currency';
import { CartPageViewComponent } from './cart-page.view';
import { CheckoutAttemptState } from '../../domain/cart/checkout-attempt-state';
import { AddressReadState } from '../../domain/customer/address-read-state';

describe('CartPageViewComponent', () => {
  it('offers an explicit full removal command even when the line has multiple units', () => {
    TestBed.configureTestingModule({ imports: [CartPageViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CartPageViewComponent);
    const state: CartState = {
      addressReadState: AddressReadState.Idle, addressErrorMessage: '', checkoutAttemptState: CheckoutAttemptState.Idle, checkoutErrorMessage: '',
      loading: false,
      errorMessage: '',
      cart: { currency: CartCurrency.Ars, lines: [{ sku: 'RETIRED', name: 'Taladro', quantity: 3, originalUnitPrice: 100, discountAmount: 0, offerRef: null, campaignRef: null, effectiveUnitPrice: 100 }] },
      addresses: [],
      addressId: '',
      idempotencyKey: 'attempt',
      receipt: null,
      failureKind: CartFailureKind.None,
    };
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('access', CustomerCartAccess.Ready);
    const emitted: { sku: string; quantity: number }[] = [];
    fixture.componentInstance.quantityChange.subscribe((command) => emitted.push(command));
    fixture.detectChanges();

    const remove = fixture.nativeElement.querySelector('button[aria-label="Eliminar Taladro del carrito"]') as HTMLButtonElement;
    expect(remove).toBeTruthy();
    remove.click();

    expect(emitted).toEqual([{ sku: 'RETIRED', quantity: 0 }]);
  });
});
