import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { AddressReadState } from '../../domain/customer/address-read-state';
import { CustomerAddress } from '../../domain/customer/customer.entity';
import { DeleteCustomerAddressUseCase } from '../../domain/customer/use-cases/delete-customer-address.usecase';
import { GetCustomerProfileUseCase } from '../../domain/customer/use-cases/get-customer-profile.usecase';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { SaveCustomerAddressUseCase } from '../../domain/customer/use-cases/save-customer-address.usecase';
import { SaveCustomerProfileUseCase } from '../../domain/customer/use-cases/save-customer-profile.usecase';
import { SignInCustomerUseCase } from '../../domain/customer/use-cases/sign-in-customer.usecase';
import { SignOutCustomerUseCase } from '../../domain/customer/use-cases/sign-out-customer.usecase';
import { CustomerStore } from './customer.store';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { ContinueCustomerPurchaseIntentPolicy } from '../../core/auth/continue-customer-purchase-intent.policy';
import { AccessState } from '../../domain/access/session-probe';

const address: CustomerAddress = { id: 'a', street: 'Calle', number: '1', city: 'Ciudad', province: 'Provincia', postalCode: '1000', isDefault: true };

function setup() {
  const list = { execute: vi.fn(() => of<readonly CustomerAddress[]>([address])) };
  const save = { execute: vi.fn(() => of(address)) };
  const remove = { execute: vi.fn(() => of(undefined)) };
  TestBed.configureTestingModule({ providers: [CustomerStore, provideRouter([]),
    { provide: ContinueCustomerPurchaseIntentPolicy, useValue: {} },
    { provide: ListCustomerAddressesUseCase, useValue: list }, { provide: SaveCustomerAddressUseCase, useValue: save },
    { provide: DeleteCustomerAddressUseCase, useValue: remove },
    { provide: AccessCoordinator, useValue: { reconcileRegisteredCustomer: () => of(AccessState.Indeterminate) } },
    ...[GetCustomerProfileUseCase, RegisterCustomerUseCase, SaveCustomerProfileUseCase, SignInCustomerUseCase, SignOutCustomerUseCase].map(provide => ({ provide, useValue: {} })),
  ] });
  const session = TestBed.inject(CustomerSession);
  const actor = (id: string) => session.commit({ id, email: `${id}@example.test`, firstName: 'Persona', lastName: 'Uno', phone: '' }, 'csrf');
  actor('A');
  return { store: TestBed.inject(CustomerStore), session, actor, list, save, remove };
}

describe('CustomerStore address authority', () => {
  it('requires a confirmed current read and preserves read errors until retry', () => {
    const f = setup();
    f.store.loadAddresses();
    expect(f.store.snapshot.addressReadState).toBe(AddressReadState.Ready);
    const read = new Subject<readonly CustomerAddress[]>(); f.list.execute.mockReturnValue(read);
    f.store.loadAddresses();
    expect(f.store.snapshot.addressReadState).toBe(AddressReadState.Loading);
    expect(f.store.snapshot.addresses).toEqual([address]);
    read.error(new Error('read failed'));
    expect(f.store.snapshot.addressReadState).toBe(AddressReadState.Error);
    expect(f.store.snapshot.errorMessage).toBeTruthy();
    f.list.execute.mockReturnValue(of([])); f.store.loadAddresses();
    expect(f.store.snapshot.addressReadState).toBe(AddressReadState.Empty);
    expect(f.store.snapshot.errorMessage).toBe('');
  });

  it.each(['list', 'save', 'remove'] as const)('cancels pending %s and clears actor A data before B can publish', (operation) => {
    const f = setup(); f.store.loadAddresses(); f.store.setAddressDraft(address);
    const pending = new Subject<never>();
    if (operation === 'list') { f.list.execute.mockReturnValue(pending); f.store.loadAddresses(); }
    if (operation === 'save') { f.save.execute.mockReturnValue(pending); f.store.persistAddress(); }
    if (operation === 'remove') { f.remove.execute.mockReturnValue(pending); f.store.removeAddress(address.id); }
    expect(pending.observed).toBe(true);
    f.actor('B');
    expect(pending.observed).toBe(false);
    expect(f.store.snapshot.addresses).toEqual([]);
    expect(f.store.snapshot.addressDraft.id).toBe('');
    expect(f.store.snapshot.addressReadState).toBe(AddressReadState.Idle);
    expect(f.store.snapshot.addressMutationPending).toBe(false);
    pending.error(new Error('late A'));
    expect(f.store.snapshot.errorMessage).toBe('');
  });

  it.each(['save', 'remove'] as const)('invalidates prior reads before %s and confirms only via its refetch', (operation) => {
    const f = setup(); f.store.loadAddresses(); f.store.setAddressDraft(address);
    const oldRead = new Subject<readonly CustomerAddress[]>(); const refetch = new Subject<readonly CustomerAddress[]>();
    f.list.execute.mockReturnValueOnce(oldRead).mockReturnValueOnce(refetch); f.store.loadAddresses();
    const mutation = new Subject<never>();
    if (operation === 'save') { f.save.execute.mockReturnValue(mutation); f.store.persistAddress(); }
    else { f.remove.execute.mockReturnValue(mutation); f.store.removeAddress(address.id); }
    expect(oldRead.observed).toBe(false);
    expect(f.store.snapshot.addressReadState.usable).toBe(false);
    expect(f.store.snapshot.addressMutationPending).toBe(true);
    // A void response confirms the mutation, but not the address list.
    mutation.next(undefined as never);
    expect(f.store.snapshot.addressReadState).toBe(AddressReadState.Loading);
    refetch.next([]);
    expect(f.store.snapshot.addressReadState).toBe(AddressReadState.Empty);
  });
});
