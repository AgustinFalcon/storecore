import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessContext } from '../../domain/access/access-context';
import { AccessState, SessionProbe } from '../../domain/access/session-probe';
import { Cart } from '../../domain/cart/cart.entity';
import { AddCartLineUseCase } from '../../domain/cart/use-cases/add-cart-line.usecase';
import { CheckoutCartUseCase } from '../../domain/cart/use-cases/checkout-cart.usecase';
import { GetCartUseCase } from '../../domain/cart/use-cases/get-cart.usecase';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { UserRole } from '../../domain/user/user-role';
import { CartStore } from './cart.store';

describe('CartStore actor isolation', () => {
  const buyer = { id: 'a', email: 'buyer@test', firstName: '', lastName: '', phone: '' };
  const buyerProbe = SessionProbe.authenticated(buyer, 'csrf');
  const userProbe = SessionProbe.authenticated({ id: 'operator', roles: [UserRole.Operator] }, 'csrf');
  it('clears cart, addresses and receipt and ignores actor A reads after B is committed', () => {
    const session = new CustomerSession(); session.commit(buyer, 'csrf');
    let state = AccessState.resolve(buyerProbe, SessionProbe.Anonymous, AccessContext.Customer);
    const read = new Subject<Cart>(); const execute = vi.fn(() => read);
    const store = new CartStore({ execute } as unknown as GetCartUseCase,
      {} as AddCartLineUseCase, {} as CheckoutCartUseCase,
      { execute: () => of([{ id: 'private-a' }]) } as unknown as ListCustomerAddressesUseCase,
      {} as Router, session, { state: () => state } as AccessCoordinator);
    store.load(); store.loadAddresses(); expect(store.snapshot.addressId).toBe('private-a');
    session.commit({ ...buyer, id: 'b' }, 'b-csrf');
    state = AccessState.resolve(SessionProbe.authenticated({ ...buyer, id: 'b' }, 'b-csrf'), SessionProbe.Anonymous, AccessContext.Customer);
    read.next({ currency: 'ARS', lines: [{ sku: 'private-a', name: 'Private A', quantity: 1,
      originalUnitPrice: 1, discountAmount: 0, effectiveUnitPrice: 1, offerRef: null, campaignRef: null }] }); read.complete();
    expect(store.snapshot.cart.lines).toEqual([]); expect(store.snapshot.addresses).toEqual([]);
    expect(store.snapshot.addressId).toBe(''); expect(store.snapshot.receipt).toBeNull(); store.ngOnDestroy();
  });
  it('USER and pending transitions never start CUSTOMER cart effects', () => {
    const session = new CustomerSession(); session.commit(buyer, 'csrf');
    let state = AccessState.resolve(buyerProbe, userProbe, AccessContext.User);
    const execute = vi.fn(() => of({ lines: [], currency: 'ARS' }));
    const store = new CartStore({ execute } as unknown as GetCartUseCase,
      { execute } as unknown as AddCartLineUseCase, { execute } as unknown as CheckoutCartUseCase,
      { execute } as unknown as ListCustomerAddressesUseCase, {} as Router, session, { state: () => state } as AccessCoordinator);
    store.load(); store.add({ sku: 'test', quantity: 1 }); store.submitCheckout(); store.loadAddresses();
    expect(execute).not.toHaveBeenCalled();
    state = AccessState.resolve(buyerProbe, userProbe, AccessContext.Customer); session.invalidatePending();
    store.add({ sku: 'test', quantity: 1 }); expect(execute).not.toHaveBeenCalled(); store.ngOnDestroy();
  });
});
