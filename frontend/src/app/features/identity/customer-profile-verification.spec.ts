import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
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

describe('profile mutations invalidate displayed email ownership', () => {
  it('requests an ownership reread after both confirmed and lost profile-save responses', () => {
    const profile = { email: 'new@example.test', firstName: 'Persona', lastName: 'Uno', phone: '' };
    const save = { execute: vi.fn(() => of(profile)) };
    TestBed.configureTestingModule({ providers: [CustomerStore, provideRouter([]),
      { provide: ContinueCustomerPurchaseIntentPolicy, useValue: {} },
      { provide: AccessCoordinator, useValue: { reconcileRegisteredCustomer: () => of(AccessState.Indeterminate) } },
      { provide: SaveCustomerProfileUseCase, useValue: save }, { provide: GetCustomerProfileUseCase, useValue: { execute: () => of(profile) } },
      ...[DeleteCustomerAddressUseCase, ListCustomerAddressesUseCase, RegisterCustomerUseCase, SaveCustomerAddressUseCase, SignInCustomerUseCase, SignOutCustomerUseCase].map(provide => ({ provide, useValue: {} })),
    ] });
    const store = TestBed.inject(CustomerStore); store.loadProfile(); expect(store.snapshot.profileRevision).toBe(1);
    store.persistProfile(); expect(store.snapshot.profileRevision).toBe(2); expect(store.snapshot.saved).toBe(true);
    save.execute.mockReturnValue(throwError(() => new Error('Response lost')));
    store.persistProfile(); expect(store.snapshot.profileRevision).toBe(3); expect(store.snapshot.saved).toBe(false);
    expect(store.snapshot.errorMessage).toBeTruthy();
  });
});
