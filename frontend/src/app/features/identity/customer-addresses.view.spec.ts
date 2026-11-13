import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AddressReadState } from '../../domain/customer/address-read-state';
import { AddressReturnTarget } from '../../domain/customer/address-return-target';
import { CustomerAddressesViewComponent } from './customer-addresses.view';
import { CustomerState } from './customer.store';

const address = { id: 'a', street: 'Calle', number: '1', city: 'Ciudad', province: 'Provincia', postalCode: '1000', isDefault: true };
const readyState: CustomerState = {
  loading: false, errorMessage: '', authenticated: true, email: '', firstName: '', lastName: '', password: '',
  profile: { email: '', firstName: '', lastName: '', phone: '' }, saved: false, profileRevision: 0,
  addresses: [address], addressDraft: address, addressReadState: AddressReadState.Ready, addressMutationPending: false,
};

describe('CustomerAddressesViewComponent', () => {
  function setup(state = readyState, target = AddressReturnTarget.Checkout) {
    TestBed.configureTestingModule({ imports: [CustomerAddressesViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CustomerAddressesViewComponent);
    fixture.componentRef.setInput('state', state); fixture.componentRef.setInput('returnTarget', target); fixture.detectChanges();
    return fixture;
  }

  it('offers an accessible fixed checkout link only for a confirmed current list', () => {
    const fixture = setup();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a');
    expect(link.textContent).toContain(AddressReturnTarget.Checkout.label);
    expect(link.getAttribute('href')).toBe(AddressReturnTarget.Checkout.path);
    expect(link.tabIndex).toBe(0);
  });

  it.each([AddressReadState.Idle, AddressReadState.Loading, AddressReadState.Empty, AddressReadState.Error, AddressReadState.Unknown])('blocks cached addresses with $wire read state', (state) => {
    const fixture = setup({ ...readyState, addressReadState: state });
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });

  it('blocks return while mutating, without confirmed addresses or with unknown destination', () => {
    const fixture = setup({ ...readyState, addressMutationPending: true });
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    fixture.componentRef.setInput('state', { ...readyState, addresses: [] }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    fixture.componentRef.setInput('state', readyState); fixture.componentRef.setInput('returnTarget', AddressReturnTarget.Unknown); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });
});
