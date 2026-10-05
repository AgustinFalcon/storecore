import { FactoryProvider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { appConfig } from '../../app.config';
import { RegisterCustomerUseCase } from '../../domain/customer/use-cases/register-customer.usecase';
import { SignInCustomerUseCase } from '../../domain/customer/use-cases/sign-in-customer.usecase';
import { SignOutCustomerUseCase } from '../../domain/customer/use-cases/sign-out-customer.usecase';
import { ProbeCustomerSessionUseCase } from '../../domain/customer/use-cases/probe-customer-session.usecase';
import { SignInUserUseCase } from '../../domain/user/use-cases/sign-in-user.usecase';
import { SignOutUserUseCase } from '../../domain/user/use-cases/sign-out-user.usecase';
import { ProbeUserSessionUseCase } from '../../domain/user/use-cases/probe-user-session.usecase';
import { UserRole } from '../../domain/user/user-role';
import { CustomerSession } from '../auth/customer-session';
import { UserSession } from '../auth/user-session';
import { CART_REPOSITORY } from '../tokens/cart.tokens';
import { CATALOG_REPOSITORY } from '../tokens/catalog.tokens';
import { CUSTOMER_REPOSITORY } from '../tokens/customer.tokens';
import { HEALTH_REPOSITORY } from '../tokens/health.tokens';
import { OFFER_REPOSITORY } from '../tokens/offer.tokens';
import { ORDER_REPOSITORY } from '../tokens/order.tokens';
import { USER_REPOSITORY } from '../tokens/user.tokens';
import { USE_CASE_PROVIDERS } from './use-case.providers';

describe('use case composition and session boundaries', () => {
  const credentials = { email: 'test@example.test', password: 'test' };
  const customerResult = { id: 'customer', email: credentials.email, firstName: 'Test', lastName: 'Customer' };
  const userResult = { id: 'user', roles: [UserRole.Admin] };
  let customerRepo: ReturnType<typeof customerRepository>;
  let userRepo: ReturnType<typeof userRepository>;
  let customer: CustomerSession;
  let user: UserSession;

  function customerRepository() {
    return {
      signIn: vi.fn(() => of(customerResult)), register: vi.fn(() => of(customerResult)),
      readProfile: vi.fn(() => of({ ...customerResult, phone: '' })),
      readCsrf: vi.fn(() => of(undefined)), logout: vi.fn(() => of(undefined)),
    };
  }
  function userRepository() {
    return { signIn: vi.fn(() => of(userResult)), readMe: vi.fn(() => of(userResult)),
      readCsrf: vi.fn(() => of(undefined)), logout: vi.fn(() => of(undefined)) };
  }

  beforeEach(() => {
    customerRepo = customerRepository(); userRepo = userRepository();
    TestBed.configureTestingModule({ providers: [
      ...appConfig.providers,
      ...[CART_REPOSITORY, CATALOG_REPOSITORY, HEALTH_REPOSITORY, OFFER_REPOSITORY, ORDER_REPOSITORY]
        .map((provide) => ({ provide, useValue: {} })),
      { provide: CUSTOMER_REPOSITORY, useValue: customerRepo },
      { provide: USER_REPOSITORY, useValue: userRepo },
    ] });
    customer = TestBed.inject(CustomerSession); user = TestBed.inject(UserSession);
  });

  it('resolves every production use case through the composition root', () => {
    for (const provider of USE_CASE_PROVIDERS as FactoryProvider[]) {
      expect(TestBed.inject(provider.provide)).toBeInstanceOf(provider.provide);
    }
  });

  it('customer sign in and registration affect only the customer session after success', async () => {
    const signIn = TestBed.inject(SignInCustomerUseCase);
    customerRepo.signIn.mockReturnValueOnce(throwError(() => new Error('denied')));
    await expect(firstValueFrom(signIn.execute(credentials))).rejects.toThrow('denied');
    expect(customer.authenticated()).toBe(false);
    await firstValueFrom(signIn.execute(credentials));
    expect(customer.authenticated()).toBe(true); expect(user.authenticated()).toBe(false);
    customer.clear();
    customerRepo.register.mockReturnValueOnce(throwError(() => new Error('denied')));
    const register = TestBed.inject(RegisterCustomerUseCase);
    const registration = { ...credentials, firstName: 'Test', lastName: 'Customer' };
    await expect(firstValueFrom(register.execute(registration))).rejects.toThrow('denied');
    expect(customer.authenticated()).toBe(false);
    await firstValueFrom(register.execute(registration));
    expect(customer.authenticated()).toBe(true); expect(user.authenticated()).toBe(false);
  });

  it('user sign in affects only the user session after success', async () => {
    const signIn = TestBed.inject(SignInUserUseCase);
    userRepo.signIn.mockReturnValueOnce(throwError(() => new Error('denied')));
    await expect(firstValueFrom(signIn.execute(credentials))).rejects.toThrow('denied');
    expect(user.authenticated()).toBe(false);
    await firstValueFrom(signIn.execute(credentials));
    expect(user.authenticated()).toBe(true); expect(customer.authenticated()).toBe(false);
  });

  it('both probes wait for their own CSRF read before marking authenticated', () => {
    const customerCsrf = new Subject<undefined>(); const userCsrf = new Subject<undefined>();
    customerRepo.readCsrf.mockReturnValue(customerCsrf); userRepo.readCsrf.mockReturnValue(userCsrf);
    TestBed.inject(ProbeCustomerSessionUseCase).execute().subscribe();
    TestBed.inject(ProbeUserSessionUseCase).execute().subscribe();
    expect(customer.authenticated()).toBe(false); expect(user.authenticated()).toBe(false);
    customerCsrf.next(undefined);
    expect(customer.authenticated()).toBe(true); expect(user.authenticated()).toBe(false);
    userCsrf.next(undefined);
    expect(user.authenticated()).toBe(true);
  });

  it('probe failures do not mark either session authenticated', async () => {
    customerRepo.readCsrf.mockReturnValue(throwError(() => new Error('csrf')));
    userRepo.readCsrf.mockReturnValue(throwError(() => new Error('csrf')));
    await expect(firstValueFrom(TestBed.inject(ProbeCustomerSessionUseCase).execute())).rejects.toThrow('csrf');
    await expect(firstValueFrom(TestBed.inject(ProbeUserSessionUseCase).execute())).rejects.toThrow('csrf');
    expect(customer.authenticated()).toBe(false); expect(user.authenticated()).toBe(false);
  });

  it('customer logout success clears only customer authentication and CSRF', async () => {
    customer.markAuthenticated(); customer.setCsrf('customer-csrf'); user.markAuthenticated(); user.setCsrf('user-csrf');
    await firstValueFrom(TestBed.inject(SignOutCustomerUseCase).execute());
    expect(customer.authenticated()).toBe(false); expect(customer.csrf()).toBe('');
    expect(user.authenticated()).toBe(true); expect(user.csrf()).toBe('user-csrf');
  });

  it('user logout success clears only user authentication and CSRF', async () => {
    customer.markAuthenticated(); customer.setCsrf('customer-csrf'); user.markAuthenticated(); user.setCsrf('user-csrf');
    await firstValueFrom(TestBed.inject(SignOutUserUseCase).execute());
    expect(user.authenticated()).toBe(false); expect(user.csrf()).toBe('');
    expect(customer.authenticated()).toBe(true); expect(customer.csrf()).toBe('customer-csrf');
  });

  it('customer CSRF and user logout errors still clear their own sessions', async () => {
    customer.markAuthenticated(); user.markAuthenticated();
    customerRepo.readCsrf.mockReturnValue(throwError(() => new Error('csrf')));
    await expect(firstValueFrom(TestBed.inject(SignOutCustomerUseCase).execute())).rejects.toThrow('csrf');
    expect(customer.authenticated()).toBe(false); expect(user.authenticated()).toBe(true);
    expect(customerRepo.logout).not.toHaveBeenCalled();
    customer.markAuthenticated();
    userRepo.logout.mockReturnValue(throwError(() => new Error('logout')));
    await expect(firstValueFrom(TestBed.inject(SignOutUserUseCase).execute())).rejects.toThrow('logout');
    expect(user.authenticated()).toBe(false); expect(customer.authenticated()).toBe(true);
  });

  it('logout failures clear only their own session, including failed CSRF reads', async () => {
    customer.markAuthenticated(); customer.setCsrf('customer-csrf'); user.markAuthenticated(); user.setCsrf('user-csrf');
    customerRepo.logout.mockReturnValue(throwError(() => new Error('logout')));
    await expect(firstValueFrom(TestBed.inject(SignOutCustomerUseCase).execute())).rejects.toThrow('logout');
    expect(customer.authenticated()).toBe(false); expect(customer.csrf()).toBe('');
    expect(user.authenticated()).toBe(true); expect(user.csrf()).toBe('user-csrf');
    customer.markAuthenticated();
    userRepo.readCsrf.mockReturnValue(throwError(() => new Error('csrf')));
    await expect(firstValueFrom(TestBed.inject(SignOutUserUseCase).execute())).rejects.toThrow('csrf');
    expect(user.authenticated()).toBe(false); expect(user.csrf()).toBe('');
    expect(customer.authenticated()).toBe(true); expect(userRepo.logout).not.toHaveBeenCalled();
  });
});
