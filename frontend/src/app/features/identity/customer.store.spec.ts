import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { CustomerProfile } from '../../domain/customer/customer.entity';
import { GetCustomerProfileUseCase } from '../../domain/customer/use-cases/get-customer-profile.usecase';
import { CustomerStore } from './customer.store';

describe('CustomerStore actor fence', () => {
  it('clears private profile and blocks delayed callbacks from the old actor', () => {
    const session = new CustomerSession();
    const buyer = { id: 'a', email: 'private-a@test', firstName: 'Private A', lastName: '', phone: '' };
    session.commit(buyer, 'csrf');
    const response = new Subject<CustomerProfile>();
    const store = new CustomerStore({} as never, {} as never, {} as never,
      { execute: () => response } as unknown as GetCustomerProfileUseCase, {} as never, {} as never,
      {} as never, {} as never, session, {} as Router);
    store.setProfile(buyer); store.loadProfile();
    session.commit({ ...buyer, id: 'b', email: 'b@test' }, 'b-csrf');
    response.next(buyer); response.complete();
    expect(store.snapshot.profile.email).toBe(''); expect(store.snapshot.profile.firstName).toBe('');
    expect(store.snapshot.addresses).toEqual([]); expect(store.snapshot.password).toBe(''); store.ngOnDestroy();
  });
});
