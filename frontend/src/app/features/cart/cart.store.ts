import { computed, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, map, merge, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessContext } from '../../domain/access/access-context';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { getApiErrorCode, getApiErrorMessage } from '../../core/api/http-error.util';
import { ApiErrorCode } from '../../core/api/api-error-code';
import { environment } from '../../../environments/environment';
import { Cart, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { CartCurrency } from '../../domain/cart/cart-currency';
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
  readonly idempotencyKey: string;
  readonly receipt: CheckoutReceipt | null;
  readonly failureKind: CartFailureKind;
}

export enum CartFailureKind {
  None = 'NONE',
  Load = 'LOAD',
  CheckoutRetryable = 'CHECKOUT_RETRYABLE',
  CheckoutProductUnavailable = 'CHECKOUT_PRODUCT_UNAVAILABLE',
  CurrencyUnavailable = 'CURRENCY_UNAVAILABLE',
}

const initialState = (): CartState => ({
  loading: false,
  errorMessage: '',
  cart: { lines: [], currency: CartCurrency.Unknown },
  addresses: [],
  addressId: '',
  idempotencyKey: crypto.randomUUID(),
  receipt: null,
  failureKind: CartFailureKind.None,
});

@Injectable({ providedIn: 'root' })
export class CartStore extends ComponentStore<CartState> {
  readonly authority = computed(() => CustomerCartAccess.resolve(this.access.state(), this.customer.actorIdentity()));
  private actor: string | null = null;
  private cartRequestGeneration = 0;
  private currencyRevoked = false;
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
      this.cartRequestGeneration += 1;
      this.currencyRevoked = false;
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
  readonly canPay$ = this.select((s) => !s.loading && s.cart.lines.length > 0 && s.addressId.length > 0 && s.cart.currency.canCheckout);

  readonly setAddressId = this.updater((s, addressId: string) => ({ ...s, addressId: s.addresses.some((address) => address.id === addressId) ? addressId : '' }));
  readonly load = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.actor !== null),
      map(() => this.beginCartRequest(true)),
      tap(() => this.patchState({
        loading: true,
        errorMessage: '',
        failureKind: this.snapshot.failureKind === CartFailureKind.CurrencyUnavailable
          ? CartFailureKind.CurrencyUnavailable
          : CartFailureKind.None,
      })),
      switchMap((request) =>
        this.getCart.execute().pipe(
          takeUntil(this.cancelActorWork),
          tapResponse({
            next: (cart) => this.acceptCartResponse(request, cart),
            error: (err: unknown) => this.acceptCartError(request.generation, err),
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
      map((line) => ({ line, request: this.beginCartRequest(false) })),
      tap(() => this.patchState({
        loading: true,
        errorMessage: '',
        failureKind: this.snapshot.failureKind === CartFailureKind.CurrencyUnavailable
          ? CartFailureKind.CurrencyUnavailable
          : CartFailureKind.None,
      })),
      switchMap(({ line, request }) =>
        this.addLine.execute(line.sku, line.quantity).pipe(
          takeUntil(this.cancelActorWork),
          tapResponse({
            next: (cart) => this.acceptCartResponse(request, cart),
            error: (err: unknown) => this.acceptCartError(request.generation, err),
          }),
        ),
      ),
    ),
  );

  readonly submitCheckout = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.actor !== null),
      tap(() => {
        if (!this.hasCurrentAddress() || !this.snapshot.cart.currency.canCheckout) {
          this.patchState({
            errorMessage: this.snapshot.cart.currency.canCheckout
              ? 'Elegí una dirección de entrega antes de pagar.'
              : CartCurrency.Unknown.label,
            failureKind: this.snapshot.cart.currency.canCheckout
              ? CartFailureKind.None
              : CartFailureKind.CurrencyUnavailable,
          });
          return;
        }
        this.patchState({ loading: true, errorMessage: '', failureKind: CartFailureKind.None });
      }),
      filter(() => this.hasCurrentAddress() && this.snapshot.cart.currency.canCheckout),
      switchMap(() =>
        this.checkout
          .execute({
            idempotencyKey: this.snapshot.idempotencyKey,
            addressId: this.snapshot.addressId,
            currency: this.snapshot.cart.currency,
          })
          .pipe(
            takeUntil(this.cancelActorWork),
            tapResponse({
              next: (receipt) => {
                this.patchState({ receipt, loading: false, idempotencyKey: crypto.randomUUID(), failureKind: CartFailureKind.None });
                const checkoutUrl = receipt.checkoutUrl ?? null;
                if (this.isAllowlistedCheckoutUrl(checkoutUrl)) {
                  window.location.assign(checkoutUrl);
                  return;
                }
                void this.router.navigate(['/checkout/result', receipt.orderId]);
              },
              error: (err: unknown) => {
                const code = getApiErrorCode(err);
                if (code === ApiErrorCode.UnsupportedCurrency) {
                  this.cartRequestGeneration += 1;
                  this.currencyRevoked = true;
                }
                this.patchState({
                  loading: false,
                  errorMessage: getApiErrorMessage(err),
                  cart: code === ApiErrorCode.UnsupportedCurrency
                    ? { ...this.snapshot.cart, currency: CartCurrency.Unknown }
                    : this.snapshot.cart,
                  failureKind: code === ApiErrorCode.UnsupportedCurrency
                    ? CartFailureKind.CurrencyUnavailable
                    : code === ApiErrorCode.ProductNotSellable
                      ? CartFailureKind.CheckoutProductUnavailable
                      : CartFailureKind.CheckoutRetryable,
                });
              },
            }),
          ),
      ),
    ),
  );

  private hasCurrentAddress(): boolean {
    return this.snapshot.addresses.some((address) => address.id === this.snapshot.addressId);
  }

  private beginCartRequest(canRestoreCurrency: boolean): CartRequest {
    return { generation: ++this.cartRequestGeneration, canRestoreCurrency };
  }

  private acceptCartResponse(request: CartRequest, cart: Cart): void {
    if (request.generation !== this.cartRequestGeneration) return;
    this.patchState(this.cartLoadedState(cart, request.canRestoreCurrency));
  }

  private acceptCartError(generation: number, error: unknown): void {
    if (generation !== this.cartRequestGeneration) return;
    this.patchState({ loading: false, errorMessage: getApiErrorMessage(error), failureKind: CartFailureKind.Load });
  }

  private cartLoadedState(cart: Cart, canRestoreCurrency: boolean): Partial<CartState> {
    if (!cart.currency.canCheckout) this.currencyRevoked = true;
    if (canRestoreCurrency && cart.currency.canCheckout) this.currencyRevoked = false;
    if (this.currencyRevoked) {
      return {
        cart: { ...cart, currency: CartCurrency.Unknown },
        loading: false,
        errorMessage: CartCurrency.Unknown.label,
        failureKind: CartFailureKind.CurrencyUnavailable,
      };
    }
    const currencyAvailable = cart.currency.canCheckout;
    return {
      cart,
      loading: false,
      errorMessage: currencyAvailable ? '' : CartCurrency.Unknown.label,
      failureKind: currencyAvailable ? CartFailureKind.None : CartFailureKind.CurrencyUnavailable,
    };
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

interface CartRequest {
  readonly generation: number;
  readonly canRestoreCurrency: boolean;
}
