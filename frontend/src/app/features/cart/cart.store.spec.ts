import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, map, of, Subject } from 'rxjs';
import { throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { mapReceipt } from '../../data/mappers/http-mappers';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, SessionProbe } from '../../domain/access/session-probe';
import { Cart, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { AddCartLineUseCase } from '../../domain/cart/use-cases/add-cart-line.usecase';
import { CheckoutCartUseCase } from '../../domain/cart/use-cases/checkout-cart.usecase';
import { GetCartUseCase } from '../../domain/cart/use-cases/get-cart.usecase';
import { CustomerAddress, CustomerProfile } from '../../domain/customer/customer.entity';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { OrderStatus, PaymentStatus } from '../../domain/order/commerce-states';
import { UserRole } from '../../domain/user/user-role';
import { CustomerCartAccess } from '../../domain/cart/customer-cart-access';
import { CartFailureKind, CartStore } from './cart.store';
import { CartCurrency } from '../../domain/cart/cart-currency';
import { CheckoutAttemptState } from '../../domain/cart/checkout-attempt-state';
import { AddressReadState } from '../../domain/customer/address-read-state';

const actorA: CustomerProfile = { id: 'actor-a', email: 'a@example.test', firstName: 'A', lastName: 'A', phone: '' };
const actorB: CustomerProfile = { ...actorA, id: 'actor-b', email: 'b@example.test' };
const address = (id: string): CustomerAddress => ({ id, street: 'S', number: '1', city: 'C', province: 'P', postalCode: '1', isDefault: true });
const cart: Cart = { lines: [{ sku: 'sku', name: 'Product', quantity: 1, effectiveUnitPrice: 1, originalUnitPrice: 1, discountAmount: 0, offerRef: null, campaignRef: null }], currency: CartCurrency.Ars };
const receipt: CheckoutReceipt = { orderId: 'order-a', paymentStatus: PaymentStatus.Pending, orderStatus: OrderStatus.Created };

describe('CartStore actor isolation', () => {
  let store: CartStore;
  let session: CustomerSession;
  let contexts: BehaviorSubject<AccessState>;
  let get: { execute: ReturnType<typeof vi.fn> };
  let add: { execute: ReturnType<typeof vi.fn> };
  let addresses: { execute: ReturnType<typeof vi.fn> };
  let checkout: { execute: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    session = new CustomerSession();
    session.commit(actorA, 'csrf-a');
    contexts = new BehaviorSubject(AccessState.resolve(SessionProbe.authenticated(actorA, 'csrf-a'), SessionProbe.Anonymous, AccessContext.Customer));
    const accepted = signal(contexts.value);
    contexts.subscribe((state) => accepted.set(state));
    get = { execute: vi.fn(() => of(cart)) };
    add = { execute: vi.fn(() => of(cart)) };
    addresses = { execute: vi.fn(() => of([address('address-a')])) };
    checkout = { execute: vi.fn(() => of(receipt)) };
    navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({ providers: [CartStore,
      { provide: CustomerSession, useValue: session },
      { provide: AccessCoordinator, useValue: { state: accepted, stateChanges$: contexts.asObservable(), selectContext: (context: AccessContext) => contexts.next(contexts.value.select(context)) } },
      { provide: GetCartUseCase, useValue: get }, { provide: AddCartLineUseCase, useValue: add },
      { provide: ListCustomerAddressesUseCase, useValue: addresses }, { provide: CheckoutCartUseCase, useValue: checkout },
      { provide: Router, useValue: { navigate } },
    ] });
    store = TestBed.inject(CartStore);
  });
  it('clears every actor-owned field and rotates the key synchronously on A → B', () => {
    store.loadAddresses();
    store.load();
    store.submitCheckout();
    store.patchState({ errorMessage: 'actor-a error', loading: true });
    const key = store.snapshot.idempotencyKey;
    expect(store.snapshot.receipt).toEqual(receipt);
    session.commit(actorB, 'csrf-b');
    expect(store.snapshot).toEqual({ loading: false, errorMessage: '', cart: { lines: [], currency: CartCurrency.Unknown }, addresses: [], addressId: '', idempotencyKey: store.snapshot.idempotencyKey, receipt: null, failureKind: CartFailureKind.None, addressReadState: AddressReadState.Idle, addressErrorMessage: '', checkoutAttemptState: CheckoutAttemptState.Idle, checkoutErrorMessage: '' });
    expect(store.snapshot.idempotencyKey).not.toBe(key);
  });
  it('cancels all four in-flight effects and ignores late actor-A results and navigation', () => {
    const pendingGet = new Subject<Cart>();
    const pendingAdd = new Subject<Cart>();
    const pendingAddresses = new Subject<readonly CustomerAddress[]>();
    const pendingCheckout = new Subject<CheckoutReceipt>();
    store.loadAddresses();
    store.load();
    get.execute.mockReturnValue(pendingGet);
    add.execute.mockReturnValue(pendingAdd);
    addresses.execute.mockReturnValue(pendingAddresses);
    checkout.execute.mockReturnValue(pendingCheckout);
    store.add({ sku: 'sku-a', quantity: 1 });
    store.patchState({ checkoutAttemptState: CheckoutAttemptState.Retryable });
    store.submitCheckout(); store.load(); store.loadAddresses();
    expect([pendingGet.observed, pendingAdd.observed, pendingAddresses.observed, pendingCheckout.observed]).toEqual([true, true, true, true]);
    session.commit(actorB, 'csrf-b');
    expect([pendingGet.observed, pendingAdd.observed, pendingAddresses.observed, pendingCheckout.observed]).toEqual([false, false, false, false]);
    pendingGet.next(cart); pendingAdd.error(new Error('late')); pendingAddresses.next([address('late-a')]); pendingCheckout.next(receipt);
    expect(store.snapshot.cart.currency).toBe(CartCurrency.Unknown);
    expect(store.snapshot.addresses).toEqual([]);
    expect(store.snapshot.receipt).toBeNull();
    expect(store.snapshot.errorMessage).toBe('');
    expect(navigate).not.toHaveBeenCalled();
    get.execute.mockReturnValue(of({ ...cart, currency: CartCurrency.Ars }));
    store.load();
    expect(store.snapshot.cart.currency).toBe(CartCurrency.Ars);
  });
  it('resets on session clear and refuses work without a customer actor', () => {
    store.loadAddresses();
    session.clear();
    store.load(); store.add({ sku: 'sku', quantity: 1 }); store.loadAddresses(); store.submitCheckout();
    expect(get.execute).not.toHaveBeenCalled();
    expect(add.execute).not.toHaveBeenCalled();
    expect(checkout.execute).not.toHaveBeenCalled();
    expect(addresses.execute).toHaveBeenCalledTimes(1);
    expect(store.snapshot.addressId).toBe('');
  });
  it('resets on leaving CUSTOMER even when the customer cookie remains accepted', () => {
    store.loadAddresses();
    const pending = new Subject<Cart>();
    get.execute.mockReturnValue(pending);
    store.load();
    const key = store.snapshot.idempotencyKey;
    contexts.next(AccessState.Indeterminate);
    expect(session.authenticated()).toBe(true);
    expect(pending.observed).toBe(false);
    expect(store.snapshot.addresses).toEqual([]);
    expect(store.snapshot.idempotencyKey).not.toBe(key);
    store.load();
    expect(get.execute).toHaveBeenCalledTimes(1);
  });
  it('preserves only an address in the current set and refuses foreign selections', () => {
    addresses.execute.mockReturnValue(of([address('first'), address('selected')]));
    store.loadAddresses(); store.setAddressId('selected');
    store.loadAddresses();
    expect(store.snapshot.addressId).toBe('selected');
    addresses.execute.mockReturnValue(of([address('replacement')]));
    store.loadAddresses();
    expect(store.snapshot.addressId).toBe('replacement');
    store.setAddressId('foreign');
    expect(store.snapshot.addressId).toBe('');
    store.submitCheckout();
    expect(checkout.execute).not.toHaveBeenCalled();
    addresses.execute.mockReturnValue(of([]));
    store.loadAddresses();
    expect(store.snapshot.addressId).toBe('');
  });
  it('keeps actor state across a same-actor CSRF refresh', () => {
    store.loadAddresses();
    store.load();
    const key = store.snapshot.idempotencyKey;
    session.commit({ ...actorA }, 'refreshed');
    expect(store.snapshot.addressId).toBe('address-a');
    expect(store.snapshot.idempotencyKey).toBe(key);
  });
  it('preserves the attempt and route when receipt translation fails, then reuses the key on retry', () => {
    store.loadAddresses();
    store.load();
    const key = store.snapshot.idempotencyKey;
    checkout.execute.mockReturnValue(of({ orderId: 'order-a', paymentStatus: null, orderStatus: OrderStatus.Created.wire }).pipe(map(mapReceipt)));
    store.submitCheckout();
    expect(store.snapshot.idempotencyKey).toBe(key);
    expect(store.snapshot.receipt).toBeNull();
    expect(store.snapshot.loading).toBe(false);
    expect(store.snapshot.checkoutErrorMessage).toBeTruthy();
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Retryable);
    expect(navigate).not.toHaveBeenCalled();
    checkout.execute.mockReturnValue(of(receipt));
    store.submitCheckout();
    expect(checkout.execute.mock.calls.map(([command]) => command.idempotencyKey)).toEqual([key, key]);
    expect(store.snapshot.receipt).toEqual(receipt);
    expect(store.snapshot.idempotencyKey).not.toBe(key);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/checkout/result', receipt.orderId]);
  });
  it('revokes stale currency after backend rejection, preserves the attempt and blocks further submits until reload', () => {
    store.load();
    store.loadAddresses();
    const key = store.snapshot.idempotencyKey;
    const staleLoad = new Subject<Cart>();
    const staleCart = new Subject<Cart>();
    const pendingCheckout = new Subject<CheckoutReceipt>();
    get.execute.mockReturnValue(staleLoad);
    add.execute.mockReturnValue(staleCart);
    checkout.execute.mockReturnValue(pendingCheckout);
    store.submitCheckout();
    store.load();
    store.add({ sku: 'sku-stale', quantity: 1 });
    pendingCheckout.error(new HttpErrorResponse({
      status: 400,
      error: { errorCode: 'UNSUPPORTED_CURRENCY', message: 'raw wire text' },
    }));

    expect(store.snapshot.cart.currency).toBe(CartCurrency.Unknown);
    expect(store.snapshot.failureKind).toBe(CartFailureKind.CurrencyUnavailable);
    expect(store.snapshot.idempotencyKey).toBe(key);
    expect(store.snapshot.checkoutErrorMessage).toBe('La moneda de esta instalación no está disponible. Actualizá el carrito antes de continuar.');
    staleLoad.next(cart);
    staleCart.next({ ...cart, lines: [{ sku: 'sku-stale', name: 'Stale', quantity: 1, originalUnitPrice: 1, discountAmount: 0, offerRef: null, campaignRef: null, effectiveUnitPrice: 1 }] });
    expect(store.snapshot.cart.currency).toBe(CartCurrency.Unknown);
    expect(store.snapshot.failureKind).toBe(CartFailureKind.CurrencyUnavailable);
    store.submitCheckout();
    expect(checkout.execute).toHaveBeenCalledTimes(1);

    get.execute.mockReturnValue(throwError(() => new Error('reload failed')));
    store.load();
    expect(store.snapshot.failureKind).toBe(CartFailureKind.Load);
    add.execute.mockReturnValue(of(cart));
    store.add({ sku: 'sku-after-failed-reload', quantity: 1 });
    const newAttemptKey = store.snapshot.idempotencyKey;
    expect(newAttemptKey).not.toBe(key);
    expect(store.snapshot.cart.currency).toBe(CartCurrency.Unknown);
    expect(store.snapshot.failureKind).toBe(CartFailureKind.CurrencyUnavailable);
    store.submitCheckout();
    expect(checkout.execute).toHaveBeenCalledTimes(1);

    get.execute.mockReturnValue(of(cart));
    store.load();
    checkout.execute.mockReturnValue(of(receipt));
    store.submitCheckout();
    expect(checkout.execute.mock.calls.at(-1)?.[0]).toMatchObject({ idempotencyKey: newAttemptKey, currency: CartCurrency.Ars });
  });
  it('shares the closed CUSTOMER authority with controls and explicitly selects it from dual USER context', () => {
    contexts.next(AccessState.resolve(SessionProbe.authenticated(actorA, 'csrf-a'),
      SessionProbe.authenticated({ id: 'operator', roles: [UserRole.Operator] }, 'csrf-user'), AccessContext.User));
    expect(session.authenticated()).toBe(true);
    expect(store.authority()).toBe(CustomerCartAccess.SelectCustomer);
    store.add({ sku: 'sku-a', quantity: 1 });
    expect(add.execute).not.toHaveBeenCalled();
    store.selectCustomer();
    expect(contexts.value.activeContext).toBe(AccessContext.Customer);
    expect(store.authority()).toBe(CustomerCartAccess.Ready);
    store.add({ sku: 'sku-b', quantity: 1 });
    expect(add.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps address errors visible when cart succeeds or remains pending', () => {
    const pending = new Subject<Cart>();
    get.execute.mockReturnValue(pending);
    addresses.execute.mockReturnValue(throwError(() => new Error('addresses failed')));
    store.load(); store.loadAddresses();
    const error = store.snapshot.addressErrorMessage;
    expect(error).toBeTruthy();
    expect(store.snapshot.loading).toBe(true);
    pending.next(cart);
    expect(store.snapshot.addressReadState).toBe(AddressReadState.Error);
    expect(store.snapshot.addressErrorMessage).toBe(error);
    expect(store.snapshot.errorMessage).toBe('');
  });

  it('keeps cart errors when addresses succeed and clears only the resource being retried', () => {
    get.execute.mockReturnValue(throwError(() => new Error('cart failed')));
    addresses.execute.mockReturnValue(throwError(() => new Error('addresses failed')));
    store.load(); store.loadAddresses();
    const cartError = store.snapshot.errorMessage;
    const pending = new Subject<readonly CustomerAddress[]>();
    addresses.execute.mockReturnValue(pending);
    store.loadAddresses();
    expect(store.snapshot.errorMessage).toBe(cartError);
    expect(store.snapshot.addressErrorMessage).toBe('');
    pending.next([address('new')]);
    expect(store.snapshot.failureKind).toBe(CartFailureKind.Load);
    expect(store.snapshot.errorMessage).toBe(cartError);
  });

  it('blocks cached addresses during refreshing and failed reads', () => {
    store.load(); store.loadAddresses();
    const pending = new Subject<readonly CustomerAddress[]>();
    addresses.execute.mockReturnValue(pending);
    store.loadAddresses(); store.submitCheckout();
    expect(store.snapshot.addresses).toHaveLength(1);
    expect(checkout.execute).not.toHaveBeenCalled();
    pending.error(new Error('read failed'));
    store.submitCheckout();
    expect(checkout.execute).not.toHaveBeenCalled();
  });

  it('keeps a retryable payment and its key across read retries and an empty cart', () => {
    store.load(); store.loadAddresses();
    checkout.execute.mockReturnValue(throwError(() => new Error('response lost')));
    store.submitCheckout();
    const key = store.snapshot.idempotencyKey;
    const error = store.snapshot.checkoutErrorMessage;
    const pending = new Subject<Cart>();
    get.execute.mockReturnValue(pending);
    store.load(); store.loadAddresses();
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Retryable);
    expect(store.snapshot.checkoutErrorMessage).toBe(error);
    expect(checkout.execute).toHaveBeenCalledTimes(1);
    pending.next({ ...cart, lines: [] });
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Retryable);
    expect(store.snapshot.idempotencyKey).toBe(key);
    checkout.execute.mockReturnValue(of(receipt));
    store.submitCheckout();
    expect(checkout.execute.mock.calls.map(([command]) => command.idempotencyKey)).toEqual([key, key]);
  });

  it('does not end a pending payment when a late GET succeeds or fails', () => {
    store.load(); store.loadAddresses();
    checkout.execute.mockReturnValue(new Subject<CheckoutReceipt>());
    store.submitCheckout();
    const pending = new Subject<Cart>();
    get.execute.mockReturnValue(pending);
    store.load();
    pending.next({ ...cart, lines: [] });
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Pending);
    pending.error(new Error('GET failed'));
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Pending);
    store.submitCheckout();
    expect(checkout.execute).toHaveBeenCalledTimes(1);
  });

  it.each([CheckoutAttemptState.ProductUnavailable, CheckoutAttemptState.Succeeded])('opens a new payable attempt after a successful cart mutation from %s', (checkoutAttemptState) => {
    store.load(); store.loadAddresses();
    store.patchState({ checkoutAttemptState, checkoutErrorMessage: 'previous attempt', receipt });
    const key = store.snapshot.idempotencyKey;
    let canPay = false;
    const subscription = store.canPay$.subscribe((value) => { canPay = value; });
    store.add({ sku: 'sku', quantity: 2 });
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Idle);
    expect(store.snapshot.checkoutErrorMessage).toBe('');
    expect(store.snapshot.idempotencyKey).not.toBe(key);
    expect(store.snapshot.receipt).toBeNull();
    expect(canPay).toBe(true);
    subscription.unsubscribe();
  });

  it.each([CheckoutAttemptState.Retryable, CheckoutAttemptState.ProductUnavailable, CheckoutAttemptState.Succeeded])('opens a new attempt only for a valid changed address from %s', (checkoutAttemptState) => {
    addresses.execute.mockReturnValue(of([address('first'), address('second')]));
    store.load(); store.loadAddresses();
    store.patchState({ checkoutAttemptState, checkoutErrorMessage: 'previous attempt' });
    const key = store.snapshot.idempotencyKey;
    store.setAddressId('first');
    expect(store.snapshot.idempotencyKey).toBe(key);
    store.setAddressId('foreign');
    expect(store.snapshot.idempotencyKey).toBe(key);
    store.setAddressId('second');
    expect(store.snapshot.addressId).toBe('second');
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Idle);
    expect(store.snapshot.checkoutErrorMessage).toBe('');
    expect(store.snapshot.idempotencyKey).not.toBe(key);
  });

  it('blocks cart and address mutations while payment is Pending', () => {
    addresses.execute.mockReturnValue(of([address('first'), address('second')]));
    store.load(); store.loadAddresses();
    checkout.execute.mockReturnValue(new Subject<CheckoutReceipt>());
    store.submitCheckout();
    const key = store.snapshot.idempotencyKey;
    store.add({ sku: 'sku', quantity: 0 });
    store.setAddressId('second');
    store.setAddressId('foreign');
    expect(add.execute).not.toHaveBeenCalled();
    expect(store.snapshot.addressId).toBe('first');
    expect(store.snapshot.idempotencyKey).toBe(key);
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Pending);
  });

  it('does not open an attempt for a failed cart mutation or a successful GET', () => {
    store.load(); store.loadAddresses();
    store.patchState({ checkoutAttemptState: CheckoutAttemptState.ProductUnavailable, checkoutErrorMessage: 'correct products' });
    const key = store.snapshot.idempotencyKey;
    add.execute.mockReturnValue(throwError(() => new Error('mutation failed')));
    store.add({ sku: 'sku', quantity: 0 });
    store.load();
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.ProductUnavailable);
    expect(store.snapshot.checkoutErrorMessage).toBe('correct products');
    expect(store.snapshot.idempotencyKey).toBe(key);
  });

  it('ignores an obsolete cart mutation success without changing attempt, key or receipt', () => {
    store.load(); store.loadAddresses();
    store.patchState({ checkoutAttemptState: CheckoutAttemptState.Succeeded, receipt });
    const key = store.snapshot.idempotencyKey;
    const pendingAdd = new Subject<Cart>();
    add.execute.mockReturnValue(pendingAdd);
    store.add({ sku: 'sku', quantity: 2 });
    store.load();
    pendingAdd.next({ ...cart, lines: [] });
    expect(store.snapshot.checkoutAttemptState).toBe(CheckoutAttemptState.Succeeded);
    expect(store.snapshot.idempotencyKey).toBe(key);
    expect(store.snapshot.receipt).toEqual(receipt);
    expect(store.snapshot.cart).toEqual(cart);
  });
});
