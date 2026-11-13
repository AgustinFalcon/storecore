import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { AddressReturnTarget } from '../../domain/customer/address-return-target';
import { CustomerAddressesComponent } from './customer-addresses.component';
import { CustomerStore } from './customer.store';

describe('CustomerAddressesComponent return authority', () => {
  it('reacts to query changes and removal, and does not rehydrate the previous query for another actor', () => {
    const query = new BehaviorSubject(convertToParamMap({ returnTo: AddressReturnTarget.Checkout.wire }));
    const store = { state$: EMPTY, loadAddresses: vi.fn() };
    TestBed.configureTestingModule({ imports: [CustomerAddressesComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: query } },
    ] }).overrideComponent(CustomerAddressesComponent, { set: { providers: [{ provide: CustomerStore, useValue: store }] } });
    const session = TestBed.inject(CustomerSession);
    const actor = (id: string) => session.commit({ id, email: `${id}@example.test`, firstName: 'Persona', lastName: 'Uno', phone: '' }, 'csrf');
    actor('A');
    const fixture = TestBed.createComponent(CustomerAddressesComponent); fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.returnTarget()).toBe(AddressReturnTarget.Checkout);
    query.next(convertToParamMap({ returnTo: 'https://example.test' }));
    expect(component.returnTarget()).toBe(AddressReturnTarget.Unknown);
    query.next(convertToParamMap({ returnTo: AddressReturnTarget.Checkout.wire }));
    expect(component.returnTarget()).toBe(AddressReturnTarget.Checkout);
    actor('B');
    expect(component.returnTarget()).toBe(AddressReturnTarget.Unknown);
    fixture.detectChanges();
    expect(component.returnTarget()).toBe(AddressReturnTarget.Unknown);
    expect(store.loadAddresses).toHaveBeenCalledTimes(2);
    query.next(convertToParamMap({ returnTo: AddressReturnTarget.Checkout.wire }));
    expect(component.returnTarget()).toBe(AddressReturnTarget.Checkout);
    query.next(convertToParamMap({}));
    expect(component.returnTarget()).toBe(AddressReturnTarget.Unknown);
    fixture.destroy();
    query.next(convertToParamMap({ returnTo: AddressReturnTarget.Checkout.wire }));
    expect(component.returnTarget()).toBe(AddressReturnTarget.Unknown);
  });
});
