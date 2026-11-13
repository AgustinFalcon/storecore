import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, Subject } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { PurchaseIntentCoordinator } from '../../core/purchase-intent/purchase-intent-coordinator';
import { CustomerSession } from '../../core/auth/customer-session';
import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessState, ContextAuthorityInspection, SessionProbe } from '../../domain/access/session-probe';
import { DeleteCustomerAddressUseCase } from '../../domain/customer/use-cases/delete-customer-address.usecase';
import { GetCustomerProfileUseCase } from '../../domain/customer/use-cases/get-customer-profile.usecase';
import { ListCustomerAddressesUseCase } from '../../domain/customer/use-cases/list-customer-addresses.usecase';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { SaveCustomerAddressUseCase } from '../../domain/customer/use-cases/save-customer-address.usecase';
import { SaveCustomerProfileUseCase } from '../../domain/customer/use-cases/save-customer-profile.usecase';
import { SignInCustomerUseCase } from '../../domain/customer/use-cases/sign-in-customer.usecase';
import { SignOutCustomerUseCase } from '../../domain/customer/use-cases/sign-out-customer.usecase';
import { CaptureReturnDestinationStep, CompleteCustomerRegistrationStep, CustomerRegistrationStage } from './customer-registration-steps';
import { CustomerStore } from './customer.store';

const customerState = AccessState.resolve(
  SessionProbe.authenticated({ email: 'buyer@example.test', firstName: 'Buyer', lastName: 'One', phone: '' }, 'csrf'),
  SessionProbe.Anonymous,
  AccessContext.Customer,
);

describe('customer registration continuation steps', () => {
  it('captures only a closed wire and resolves CUSTOMER routes without raw paths', () => {
    const capture = new CaptureReturnDestinationStep();
    const complete = new CompleteCustomerRegistrationStep();
    expect(capture.capture('CHECKOUT')).toBe(ReturnDestination.Checkout);
    expect(capture.capture('https://evil.example')).toBe(ReturnDestination.Unknown);
    expect(complete.route(ReturnDestination.Checkout)).toBe('/checkout');
    expect(complete.route(ReturnDestination.UserOrders)).toBe('/customer/profile');
    expect(complete.route(ReturnDestination.Unknown)).toBe('/customer/profile');
  });
});

describe('CustomerStore registration authority', () => {
  function setup(states: readonly AccessState[], response?: Observable<unknown>,
    inspection: ContextAuthorityInspection = ContextAuthorityInspection.Absent) {
    const registration = response ?? of({ id: '1', email: 'buyer@example.test', firstName: 'Buyer', lastName: 'One' });
    const register = { execute: vi.fn(() => registration) };
    let attempt = 0;
    const access = {
      reconcileRegisteredCustomer: vi.fn(() => of(states[Math.min(attempt++, states.length - 1)])),
      inspectCustomerAccess: vi.fn(() => of(inspection)),
    };
    const router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({ providers: [CustomerStore,
      { provide: PurchaseIntentCoordinator, useValue: { validatedResumeReference: (raw: unknown) => raw === 'opaque-flow' ? raw : null,
        continuationForCustomer: (raw: unknown) => raw === 'opaque-flow' ? { productSku: 'product-2', flowId: raw } : null } },
      { provide: RegisterCustomerUseCase, useValue: register }, { provide: AccessCoordinator, useValue: access },
      { provide: Router, useValue: router }, CustomerSession,
      ...[DeleteCustomerAddressUseCase, GetCustomerProfileUseCase, ListCustomerAddressesUseCase, SaveCustomerAddressUseCase,
        SaveCustomerProfileUseCase, SignInCustomerUseCase, SignOutCustomerUseCase].map((provide) => ({ provide, useValue: {} })),
    ] });
    const store = TestBed.inject(CustomerStore);
    store.setFirstName('Buyer'); store.setLastName('One'); store.setEmail('buyer@example.test'); store.setPassword('password-long-enough');
    store.setReturnDestination(ReturnDestination.Checkout);
    return { store, register, access, router };
  }

  it('navigates only after authoritative CUSTOMER reconciliation', () => {
    const f = setup([customerState]);
    f.store.submitRegister();
    expect(f.register.execute).toHaveBeenCalledTimes(1);
    expect(f.access.reconcileRegisteredCustomer).toHaveBeenCalledTimes(1);
    expect(f.router.navigateByUrl).toHaveBeenCalledWith('/checkout');
    expect(f.store.snapshot.registrationStage).toBe(CustomerRegistrationStage.Complete);
  });

  it('keeps the opaque reference through failed reconciliation without repeating registration', () => {
    const f = setup([AccessState.Indeterminate, customerState]);
    f.store.setReturnDestination(ReturnDestination.Catalog);
    f.store.setResumeReference('opaque-flow');
    f.store.submitRegister();
    expect(f.router.navigateByUrl).not.toHaveBeenCalled();
    f.store.submitRegister();
    expect(f.register.execute).toHaveBeenCalledTimes(1);
    expect(f.router.navigateByUrl).toHaveBeenCalledWith('/catalog/product-2?resume=opaque-flow');
  });

  it('continues an already accepted CUSTOMER directly to the validated PDP', () => {
    const f = setup([customerState], undefined, ContextAuthorityInspection.Accepted);
    f.store.setReturnDestination(ReturnDestination.Catalog);
    f.store.setResumeReference('opaque-flow');
    f.store.initializeRegistration();
    expect(f.register.execute).not.toHaveBeenCalled();
    expect(f.router.navigateByUrl).toHaveBeenCalledWith('/catalog/product-2?resume=opaque-flow');
  });

  it('recognizes an already accepted CUSTOMER and never exposes a second registration', () => {
    const f = setup([customerState], undefined, ContextAuthorityInspection.Accepted);
    f.store.initializeRegistration();
    expect(f.store.snapshot.registrationStage).toBe(CustomerRegistrationStage.Complete);
    expect(f.register.execute).not.toHaveBeenCalled();
    expect(f.access.inspectCustomerAccess).toHaveBeenCalledTimes(1);
  });

  it('fails closed when existing-session inspection is unavailable', () => {
    const f = setup([customerState], undefined, ContextAuthorityInspection.Unavailable);
    f.store.initializeRegistration();
    expect(f.store.snapshot.registrationStage).toBe(CustomerRegistrationStage.InspectionRequired);
    f.store.submitRegister();
    expect(f.register.execute).not.toHaveBeenCalled();
  });

  it('retries only reconciliation after an accepted registration response', () => {
    const f = setup([AccessState.Indeterminate, customerState]);
    f.store.submitRegister();
    expect(f.router.navigateByUrl).not.toHaveBeenCalled();
    expect(f.store.snapshot.registrationStage).toBe(CustomerRegistrationStage.ReconcileRequired);
    f.store.submitRegister();
    expect(f.register.execute).toHaveBeenCalledTimes(1);
    expect(f.access.reconcileRegisteredCustomer).toHaveBeenCalledTimes(2);
    expect(f.router.navigateByUrl).toHaveBeenCalledWith('/checkout');
  });

  it('exhausts duplicate registration submits while the first response is pending', () => {
    const pending = new Subject<unknown>();
    const f = setup([customerState], pending);
    f.store.submitRegister(); f.store.submitRegister();
    expect(f.register.execute).toHaveBeenCalledTimes(1);
    pending.next({ id: '1' }); pending.complete();
    expect(f.access.reconcileRegisteredCustomer).toHaveBeenCalledTimes(1);
  });
});
