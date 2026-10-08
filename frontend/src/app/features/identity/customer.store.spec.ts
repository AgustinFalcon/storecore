import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { CustomerProfile } from '../../domain/customer/customer.entity';
import { GetCustomerProfileUseCase } from '../../domain/customer/use-cases/get-customer-profile.usecase';
import { CustomerStore } from './customer.store';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { ICustomerRepository } from '../../domain/customer/customer.repository';
import { CustomerSessionResult } from '../../domain/customer/customer.entity';

describe('CustomerStore actor fence', () => {
  for (const superseded of [false, true]) {
    it(`registration ${superseded ? 'cannot navigate or patch another actor' : 'survives its own synchronous actor change and navigates'}`, () => {
      const session = new CustomerSession();
      const response = new Subject<CustomerSessionResult>();
      const registration = new RegisterCustomerUseCase({ register: () => response } as unknown as ICustomerRepository, session);
      const navigateByUrl = vi.fn();
      const store = new CustomerStore(registration, {} as never, {} as never, {} as never,
        {} as never, {} as never, {} as never, {} as never, session, { navigateByUrl } as unknown as Router);
      store.setEmail('registration@test'); store.setPassword('password'); store.setFirstName('First'); store.setLastName('Last');
      store.submitRegister();
      if (superseded) session.commit({ id: 'other', email: 'other@test', firstName: 'Other', lastName: '', phone: '' }, 'other-csrf');
      response.next({ id: 'registered', email: 'registration@test', firstName: 'First', lastName: 'Last' }); response.complete();
      expect(navigateByUrl).toHaveBeenCalledTimes(superseded ? 0 : 1);
      if (!superseded) expect(navigateByUrl).toHaveBeenCalledWith('/customer/profile');
      expect(store.snapshot.loading).toBe(false); expect(store.snapshot.password).toBe('');
      expect(store.snapshot.errorMessage).toBe('');
      expect(store.snapshot.authenticated).toBe(!superseded);
      if (superseded) expect(session.actorId()).toBe('other');
      store.ngOnDestroy();
    });
  }
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
