import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
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
import { CartStore } from './cart.store';

const actorA: CustomerProfile = { id: 'actor-a', email: 'a@example.test', firstName: 'A', lastName: 'A', phone: '' };
const actorB: CustomerProfile = { ...actorA, id: 'actor-b', email: 'b@example.test' };
const address = (id: string): CustomerAddress => ({ id, street: 'S', number: '1', city: 'C', province: 'P', postalCode: '1', isDefault: true });
const cart: Cart = { lines: [], currency: 'ARS' };
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
    store.submitCheckout();
    store.patchState({ errorMessage: 'actor-a error', loading: true, currency: 'ARS' });
    const key = store.snapshot.idempotencyKey;
    expect(store.snapshot.receipt).toEqual(receipt);
    session.commit(actorB, 'csrf-b');
    expect(store.snapshot).toEqual({ loading: false, errorMessage: '', cart: { lines: [], currency: '' }, addresses: [], addressId: '', currency: 'ARS', idempotencyKey: store.snapshot.idempotencyKey, receipt: null });
    expect(store.snapshot.idempotencyKey).not.toBe(key);
  });
  it('cancels all four in-flight effects and ignores late actor-A results and navigation', () => {
    const pendingGet = new Subject<Cart>();
    const pendingAdd = new Subject<Cart>();
    const pendingAddresses = new Subject<readonly CustomerAddress[]>();
    const pendingCheckout = new Subject<CheckoutReceipt>();
    store.loadAddresses();
    get.execute.mockReturnValue(pendingGet);
    add.execute.mockReturnValue(pendingAdd);
    addresses.execute.mockReturnValue(pendingAddresses);
    checkout.execute.mockReturnValue(pendingCheckout);
    store.load(); store.add({ sku: 'sku-a', quantity: 1 }); store.loadAddresses(); store.submitCheckout();
    expect([pendingGet.observed, pendingAdd.observed, pendingAddresses.observed, pendingCheckout.observed]).toEqual([true, true, true, true]);
    session.commit(actorB, 'csrf-b');
    expect([pendingGet.observed, pendingAdd.observed, pendingAddresses.observed, pendingCheckout.observed]).toEqual([false, false, false, false]);
    pendingGet.next(cart); pendingAdd.error(new Error('late')); pendingAddresses.next([address('late-a')]); pendingCheckout.next(receipt);
    expect(store.snapshot.cart.currency).toBe('');
    expect(store.snapshot.addresses).toEqual([]);
    expect(store.snapshot.receipt).toBeNull();
    expect(store.snapshot.errorMessage).toBe('');
    expect(navigate).not.toHaveBeenCalled();
    get.execute.mockReturnValue(of({ ...cart, currency: 'actor-b' }));
    store.load();
    expect(store.snapshot.cart.currency).toBe('actor-b');
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
    const key = store.snapshot.idempotencyKey;
    session.commit({ ...actorA }, 'refreshed');
    expect(store.snapshot.addressId).toBe('address-a');
    expect(store.snapshot.idempotencyKey).toBe(key);
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
});
