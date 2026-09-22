import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, switchMap, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { Cart, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { AddCartLineUseCase } from '../../domain/cart/use-cases/add-cart-line.usecase';
import { CheckoutCartUseCase } from '../../domain/cart/use-cases/checkout-cart.usecase';
import { GetCartUseCase } from '../../domain/cart/use-cases/get-cart.usecase';
import { CustomerAddress } from '../../domain/customer/customer.entity';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';

export interface CartState {
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly cart: Cart;
  readonly addresses: readonly CustomerAddress[];
  readonly addressId: string;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly receipt: CheckoutReceipt | null;
}

const INITIAL: CartState = {
  loading: false,
  errorMessage: '',
  cart: { lines: [], currency: '' },
  addresses: [],
  addressId: '',
  currency: 'ARS',
  idempotencyKey: crypto.randomUUID(),
  receipt: null,
};

@Injectable({ providedIn: 'root' })
export class CartStore extends ComponentStore<CartState> {
  constructor(
    private readonly getCart: GetCartUseCase,
    private readonly addLine: AddCartLineUseCase,
    private readonly checkout: CheckoutCartUseCase,
    private readonly listAddresses: ListCustomerAddressesUseCase,
    private readonly router: Router,
  ) {
    super(INITIAL);
  }

  get snapshot(): CartState {
    return this.get((s) => s);
  }

  readonly loading$ = this.select((s) => s.loading);
  readonly errorMessage$ = this.select((s) => s.errorMessage);
  readonly cart$ = this.select((s) => s.cart);
  readonly addresses$ = this.select((s) => s.addresses);
  readonly receipt$ = this.select((s) => s.receipt);
  readonly empty$ = this.select((s) => !s.loading && s.cart.lines.length === 0);
  readonly canPay$ = this.select((s) => !s.loading && s.cart.lines.length > 0 && s.addressId.length > 0 && s.currency.length > 0);

  readonly setAddressId = this.updater((s, addressId: string) => ({ ...s, addressId }));
  readonly setCurrency = this.updater((s, currency: string) => ({ ...s, currency: currency === 'ARS' ? currency : 'ARS' }));

  readonly load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap(() =>
        this.getCart.execute().pipe(
          tapResponse({
            next: (cart) =>
              this.patchState({
                cart,
                currency: 'ARS',
                loading: false,
              }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly loadAddresses = this.effect<void>((trigger$) =>
    trigger$.pipe(
      switchMap(() =>
        this.listAddresses.execute().pipe(
          tapResponse({
            next: (addresses) =>
              this.patchState({
                addresses,
                addressId: this.snapshot.addressId || addresses[0]?.id || '',
              }),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly add = this.effect<{ sku: string; quantity: number }>((line$) =>
    line$.pipe(
      tap(() => this.patchState({ loading: true, errorMessage: '' })),
      switchMap((line) =>
        this.addLine.execute(line.sku, line.quantity).pipe(
          tapResponse({
            next: (cart) => this.patchState({ cart, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
          }),
        ),
      ),
    ),
  );

  readonly submitCheckout = this.effect<void>((trigger$) =>
    trigger$.pipe(
      tap(() => {
        if (!this.snapshot.addressId || !this.snapshot.currency) {
          this.patchState({ errorMessage: 'Elegí entrega y moneda antes de pagar.' });
          return;
        }
        this.patchState({ loading: true, errorMessage: '' });
      }),
      filter(() => Boolean(this.snapshot.addressId && this.snapshot.currency)),
      switchMap(() =>
        this.checkout
          .execute({
            idempotencyKey: this.snapshot.idempotencyKey,
            addressId: this.snapshot.addressId,
            currency: this.snapshot.currency,
          })
          .pipe(
            tapResponse({
              next: (receipt) => {
                this.patchState({ receipt, loading: false, idempotencyKey: crypto.randomUUID(), currency: 'ARS' });
                void this.router.navigate(['/checkout/result', receipt.orderId]);
              },
              error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err) }),
            }),
          ),
      ),
    ),
  );
}
