import { computed, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, merge, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessContext } from '../../domain/access/access-context';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { getApiErrorCode, getApiErrorMessage } from '../../core/api/http-error.util';
import { ApiErrorCode } from '../../core/api/api-error-code';
import { environment } from '../../../environments/environment';
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
  readonly failureKind: CartFailureKind;
}

export enum CartFailureKind {
  None = 'NONE',
  Load = 'LOAD',
  CheckoutRetryable = 'CHECKOUT_RETRYABLE',
  CheckoutProductUnavailable = 'CHECKOUT_PRODUCT_UNAVAILABLE',
}

const initialState = (): CartState => ({
  loading: false,
  errorMessage: '',
  cart: { lines: [], currency: '' },
  addresses: [],
  addressId: '',
  currency: 'ARS',
  idempotencyKey: crypto.randomUUID(),
  receipt: null,
  failureKind: CartFailureKind.None,
});

@Injectable({ providedIn: 'root' })
export class CartStore extends ComponentStore<CartState> {
  readonly authority = computed(() => CustomerCartAccess.resolve(this.access.state(), this.customer.actorIdentity()));
  private actor: string | null = null;
  private readonly cancelActorWork = new Subject<void>();
  constructor(
    private readonly getCart: GetCartUseCase,
    private readonly addLine: AddCartLineUseCase,
    private readonly checkout: CheckoutCartUseCase,
    private readonly listAddresses: ListCustomerAddressesUseCase,
    private readonly router: Router,
    private readonly customer: CustomerSession,
    private readonly access: AccessCoordinator,
  ) {
    super(initialState());
    merge(this.customer.actorChanges$, this.access.stateChanges$).pipe(takeUntil(this.destroy$)).subscribe(() => {
      const actor = this.authority().canMutate ? this.customer.actorIdentity() : null;
      if (actor === this.actor) return;
      this.actor = actor;
      this.cancelActorWork.next();
      this.setState(initialState());
    });
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

  readonly setAddressId = this.updater((s, addressId: string) => ({ ...s, addressId: s.addresses.some((address) => address.id === addressId) ? addressId : '' }));
  readonly setCurrency = this.updater((s, currency: string) => ({ ...s, currency: currency === 'ARS' ? currency : 'ARS' }));

  readonly load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.actor !== null),
      tap(() => this.patchState({ loading: true, errorMessage: '', failureKind: CartFailureKind.None })),
      switchMap(() =>
        this.getCart.execute().pipe(
          takeUntil(this.cancelActorWork),
          tapResponse({
            next: (cart) =>
              this.patchState({
                cart,
                currency: 'ARS',
                loading: false,
              }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err), failureKind: CartFailureKind.Load }),
          }),
        ),
      ),
    ),
  );

  readonly loadAddresses = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.actor !== null),
      switchMap(() =>
        this.listAddresses.execute().pipe(
          takeUntil(this.cancelActorWork),
          tapResponse({
            next: (addresses) =>
              this.patchState({
                addresses,
                addressId: addresses.some((address) => address.id === this.snapshot.addressId) ? this.snapshot.addressId : addresses[0]?.id ?? '',
              }),
            error: (err: unknown) => this.patchState({ errorMessage: getApiErrorMessage(err), failureKind: CartFailureKind.Load }),
          }),
        ),
      ),
    ),
  );

  readonly add = this.effect<{ sku: string; quantity: number }>((line$) =>
    line$.pipe(
      filter(() => this.actor !== null),
      tap(() => this.patchState({ loading: true, errorMessage: '', failureKind: CartFailureKind.None })),
      switchMap((line) =>
        this.addLine.execute(line.sku, line.quantity).pipe(
          takeUntil(this.cancelActorWork),
          tapResponse({
            next: (cart) => this.patchState({ cart, loading: false }),
            error: (err: unknown) => this.patchState({ loading: false, errorMessage: getApiErrorMessage(err), failureKind: CartFailureKind.Load }),
          }),
        ),
      ),
    ),
  );

  readonly submitCheckout = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.actor !== null),
      tap(() => {
        if (!this.hasCurrentAddress() || !this.snapshot.currency) {
          this.patchState({ errorMessage: 'Elegí entrega y moneda antes de pagar.', failureKind: CartFailureKind.None });
          return;
        }
        this.patchState({ loading: true, errorMessage: '', failureKind: CartFailureKind.None });
      }),
      filter(() => Boolean(this.hasCurrentAddress() && this.snapshot.currency)),
      switchMap(() =>
        this.checkout
          .execute({
            idempotencyKey: this.snapshot.idempotencyKey,
            addressId: this.snapshot.addressId,
            currency: this.snapshot.currency,
          })
          .pipe(
            takeUntil(this.cancelActorWork),
            tapResponse({
              next: (receipt) => {
                this.patchState({ receipt, loading: false, idempotencyKey: crypto.randomUUID(), currency: 'ARS', failureKind: CartFailureKind.None });
                const checkoutUrl = receipt.checkoutUrl ?? null;
                if (this.isAllowlistedCheckoutUrl(checkoutUrl)) {
                  window.location.assign(checkoutUrl);
                  return;
                }
                void this.router.navigate(['/checkout/result', receipt.orderId]);
              },
              error: (err: unknown) => this.patchState({
                loading: false,
                errorMessage: getApiErrorMessage(err),
                failureKind: getApiErrorCode(err) === ApiErrorCode.ProductNotSellable
                  ? CartFailureKind.CheckoutProductUnavailable
                  : CartFailureKind.CheckoutRetryable,
              }),
            }),
          ),
      ),
    ),
  );

  private hasCurrentAddress(): boolean {
    return this.snapshot.addresses.some((address) => address.id === this.snapshot.addressId);
  }

  selectCustomer(): void {
    if (!this.authority().requiresSelection) return;
    this.access.selectContext(AccessContext.Customer);
    this.load();
    this.loadAddresses();
  }

  private isAllowlistedCheckoutUrl(value: string | null): value is string {
    if (!value) {
      return false;
    }
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && environment.checkoutAllowedOrigins.includes(url.origin);
    } catch {
      return false;
    }
  }
}
