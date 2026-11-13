import { HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { filter, map, merge, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessContext } from '../../domain/access/access-context';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartFailureKind } from '../../domain/cart/cart-failure-kind';
import { CheckoutAttemptState } from '../../domain/cart/checkout-attempt-state';
import { AddressReadState } from '../../domain/customer/address-read-state';
export { CartFailureKind } from '../../domain/cart/cart-failure-kind';
import { getApiErrorCode, getApiErrorMessage } from '../../core/api/http-error.util';
import { ApiErrorCode } from '../../core/api/api-error-code';
import { environment } from '../../../environments/environment';
import { Cart, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { CartLineMutationOutcome, SetCartLineCommand } from '../../domain/cart/cart-line-mutation-outcome';
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
  readonly addressReadState: AddressReadState;
  readonly addressErrorMessage: string;
  readonly checkoutAttemptState: CheckoutAttemptState;
  readonly checkoutErrorMessage: string;
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
  addressReadState: AddressReadState.Idle,
  addressErrorMessage: '',
  checkoutAttemptState: CheckoutAttemptState.Idle,
  checkoutErrorMessage: '',
});

@Injectable({ providedIn: 'root' })
export class CartStore extends ComponentStore<CartState> {
  readonly authority = computed(() => CustomerCartAccess.resolve(this.access.state(), this.customer.actorIdentity()));
  private actor: string | null = null;
  private cartRequestGeneration = 0;
  private addressRequestGeneration = 0;
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
      this.addressRequestGeneration += 1;
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
  readonly canPay$ = this.select((s) => s.checkoutAttemptState === CheckoutAttemptState.Idle && s.failureKind === CartFailureKind.None && !s.loading && s.cart.lines.length > 0 && s.addressReadState === AddressReadState.Ready && s.addresses.some((address) => address.id === s.addressId) && s.cart.currency.canCheckout);
  readonly viewState$ = this.select((s) => s);

  readonly setAddressId = this.updater((s, addressId: string) => {
    if (s.checkoutAttemptState.inFlight) return s;
    const valid = s.addressReadState === AddressReadState.Ready && s.addresses.some((address) => address.id === addressId);
    const opensAttempt = valid && addressId !== s.addressId
      && (s.checkoutAttemptState === CheckoutAttemptState.Retryable
        || s.checkoutAttemptState === CheckoutAttemptState.ProductUnavailable
        || s.checkoutAttemptState === CheckoutAttemptState.Succeeded);
    return { ...s, ...(opensAttempt ? this.newCheckoutAttempt() : {}), addressId: valid ? addressId : '' };
  });
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
      map(() => ++this.addressRequestGeneration),
      tap(() => this.patchState({ addressReadState: AddressReadState.Loading, addressErrorMessage: '' })),
      switchMap((generation) =>
        this.listAddresses.execute().pipe(
          takeUntil(this.cancelActorWork),
          tapResponse({
            next: (addresses) => {
              if (generation !== this.addressRequestGeneration) return;
              this.patchState({
                addresses,
                addressReadState: addresses.length > 0 ? AddressReadState.Ready : AddressReadState.Empty,
                addressId: addresses.some((address) => address.id === this.snapshot.addressId) ? this.snapshot.addressId : addresses[0]?.id ?? '',
              });
            },
            error: (err: unknown) => {
              if (generation !== this.addressRequestGeneration) return;
              this.patchState({ addressReadState: AddressReadState.Error, addressErrorMessage: getApiErrorMessage(err) });
            },
          }),
        ),
      ),
    ),
  );

  readonly add = this.effect<SetCartLineCommand>((line$) =>
    line$.pipe(
      filter(() => this.actor !== null && !this.snapshot.checkoutAttemptState.inFlight),
      map((line) => ({ line, actor: this.actor, request: this.beginCartRequest(false) })),
      tap(() => this.patchState({
        loading: true,
        errorMessage: '',
        failureKind: this.snapshot.failureKind === CartFailureKind.CurrencyUnavailable
          ? CartFailureKind.CurrencyUnavailable
          : CartFailureKind.None,
      })),
      switchMap(({ line, actor, request }) =>
        this.addLine.execute(line.sku, line.quantity).pipe(
          takeUntil(this.cancelActorWork),
          tapResponse({
            next: (cart) => {
              const accepted = this.acceptCartResponse(request, cart);
              if (actor === this.actor) {
                line.report?.(CartLineMutationOutcome.Accepted);
                if (accepted && !this.snapshot.checkoutAttemptState.inFlight) this.patchState(this.newCheckoutAttempt());
              }
            },
            error: (err: unknown) => {
              this.acceptCartError(request.generation, err);
              if (actor === this.actor) line.report?.(err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500
                ? CartLineMutationOutcome.Rejected : CartLineMutationOutcome.OutcomeUnknown);
            },
          }),
        ),
      ),
    ),
  );

  readonly submitCheckout = this.effect<void>((trigger$) =>
    trigger$.pipe(
      filter(() => this.actor !== null),
      filter(() => this.hasCurrentAddress() && this.snapshot.cart.currency.canCheckout
        && (this.snapshot.checkoutAttemptState.paymentRetry
          || (this.snapshot.checkoutAttemptState === CheckoutAttemptState.Idle && this.snapshot.cart.lines.length > 0 && !this.snapshot.loading && this.snapshot.failureKind === CartFailureKind.None))),
      tap(() => this.patchState({ checkoutAttemptState: CheckoutAttemptState.Pending, checkoutErrorMessage: '' })),
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
                this.patchState({ receipt, idempotencyKey: crypto.randomUUID(), checkoutAttemptState: CheckoutAttemptState.Succeeded, checkoutErrorMessage: '' });
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
                  checkoutErrorMessage: getApiErrorMessage(err),
                  cart: code === ApiErrorCode.UnsupportedCurrency
                    ? { ...this.snapshot.cart, currency: CartCurrency.Unknown }
                    : this.snapshot.cart,
                  failureKind: code === ApiErrorCode.UnsupportedCurrency
                    ? CartFailureKind.CurrencyUnavailable
                    : this.snapshot.failureKind,
                  checkoutAttemptState: code === ApiErrorCode.UnsupportedCurrency
                    ? CheckoutAttemptState.Idle
                    : code === ApiErrorCode.ProductNotSellable
                      ? CheckoutAttemptState.ProductUnavailable
                      : CheckoutAttemptState.Retryable,
                });
              },
            }),
          ),
      ),
    ),
  );

  private hasCurrentAddress(): boolean {
    return this.snapshot.addressReadState === AddressReadState.Ready && this.snapshot.addresses.some((address) => address.id === this.snapshot.addressId);
  }

  private newCheckoutAttempt(): Partial<CartState> {
    return { checkoutAttemptState: CheckoutAttemptState.Idle, checkoutErrorMessage: '', idempotencyKey: crypto.randomUUID(), receipt: null };
  }

  private beginCartRequest(canRestoreCurrency: boolean): CartRequest {
    return { generation: ++this.cartRequestGeneration, canRestoreCurrency };
  }

  private acceptCartResponse(request: CartRequest, cart: Cart): boolean {
    if (request.generation !== this.cartRequestGeneration) return false;
    this.patchState(this.cartLoadedState(cart, request.canRestoreCurrency));
    return true;
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
