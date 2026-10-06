import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { ACCESS_REPOSITORY } from '../../core/tokens/access.tokens';
import { AccessContext } from '../../domain/access/access-context';
import { AccessHome } from '../../domain/access/access-home';
import { LoginResult } from '../../domain/access/login-resolution';
import { LoginStage } from '../../domain/access/login-stage';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessState, SessionProbe } from '../../domain/access/session-probe';
import { UserRole } from '../../domain/user/user-role';
import { LoginStore } from './login.store';

const customerProbe = SessionProbe.authenticated({ email: 'buyer@example.test', firstName: '', lastName: '', phone: '' }, 'customer-csrf');
const userProbe = SessionProbe.authenticated({ id: 'user-1', roles: [UserRole.Operator] }, 'user-csrf');
const selectedCustomer = AccessState.resolve(customerProbe, SessionProbe.Anonymous, AccessContext.Customer);
const dualSessions = AccessState.resolve(customerProbe, userProbe, AccessContext.Unknown);
const challenge = () => LoginResult.selectionRequired('c'.repeat(32), [AccessContext.Customer, AccessContext.User], new Date(Date.now() + 120_000).toISOString(), ReturnDestination.Home);

describe('LoginStore', () => {
  let store: LoginStore;
  let response: Subject<LoginResult>;
  let repository: { signIn: ReturnType<typeof vi.fn>; selectContext: ReturnType<typeof vi.fn> };
  let coordinator: { rehydrate: ReturnType<typeof vi.fn>; supersedeProbes: ReturnType<typeof vi.fn>; acceptAuthenticated: ReturnType<typeof vi.fn>; selectContext: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    response = new Subject<LoginResult>();
    repository = { signIn: vi.fn(() => response), selectContext: vi.fn(() => response) };
    coordinator = { rehydrate: vi.fn(() => of(AccessState.Anonymous)), supersedeProbes: vi.fn(), acceptAuthenticated: vi.fn(() => of(selectedCustomer)), selectContext: vi.fn((context: AccessContext) => dualSessions.select(context)) };
    router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({ providers: [LoginStore, { provide: ACCESS_REPOSITORY, useValue: repository }, { provide: AccessCoordinator, useValue: coordinator }, { provide: Router, useValue: router }] });
    store = TestBed.inject(LoginStore);
    store.initialize(ReturnDestination.Home);
  });
  function submit(): void { store.setEmail('buyer@example.test'); store.setPassword('password-long-enough'); store.submit(); }

  it('exhausts duplicate submissions and clears the captured password before awaiting the response', () => {
    submit(); store.submit();
    expect(repository.signIn).toHaveBeenCalledTimes(1);
    expect(store.snapshot.password).toBe('');
    expect(store.snapshot.busy).toBe(true);
    response.next(LoginResult.Rejected); response.complete();
    expect(store.snapshot.stage).toBe(LoginStage.CollectCredentials);
    expect(store.snapshot.busy).toBe(false);
    expect(store.snapshot.email).toBe('');
  });
  it('only sends closed validated return destinations', () => {
    store.initialize(ReturnDestination.fromPath('https://external.example'));
    submit();
    expect(repository.signIn).toHaveBeenCalledWith(expect.objectContaining({ returnPath: '/' }));
  });
  it('waits for atomic acceptance before navigation', () => {
    const acceptance = new Subject<AccessState>();
    coordinator.acceptAuthenticated.mockReturnValue(acceptance);
    submit(); response.next(LoginResult.authenticated(AccessContext.Customer, AccessHome.Storefront, ReturnDestination.CustomerOrders));
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    acceptance.next(selectedCustomer); acceptance.complete(); response.complete();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/customer/orders');
    expect(store.snapshot.stage).toBe(LoginStage.CompleteAccess);
  });
  it('uses one challenge selection POST and clears the challenge after rejection', () => {
    submit(); response.next(challenge()); response.complete();
    expect(coordinator.acceptAuthenticated).not.toHaveBeenCalled();
    expect(store.snapshot.stage).toBe(LoginStage.SelectContext);
    response = new Subject<LoginResult>(); repository.selectContext.mockReturnValue(response);
    store.submit(AccessContext.User); store.submit(AccessContext.User);
    expect(repository.selectContext).toHaveBeenCalledTimes(1);
    response.next(LoginResult.Rejected); response.complete();
    store.submit(AccessContext.User);
    expect(repository.selectContext).toHaveBeenCalledTimes(1);
    expect(store.snapshot.password).toBe('');
  });
  it('chooses already probed sessions locally without a challenge request', () => {
    coordinator.rehydrate.mockReturnValue(of(dualSessions));
    store.initialize(ReturnDestination.UserOrders);
    store.submit(AccessContext.User);
    expect(repository.selectContext).not.toHaveBeenCalled();
    expect(coordinator.selectContext).toHaveBeenCalledWith(AccessContext.User);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/user/orders');
  });
  it('cannot select an unverified context or navigate after failed acceptance', () => {
    submit(); response.next(challenge()); response.complete();
    store.submit(AccessContext.Unknown);
    expect(repository.selectContext).not.toHaveBeenCalled();
    response = new Subject<LoginResult>(); repository.selectContext.mockReturnValue(response);
    coordinator.acceptAuthenticated.mockReturnValue(of(AccessState.Indeterminate));
    store.submit(AccessContext.Customer);
    response.next(LoginResult.authenticated(AccessContext.Customer, AccessHome.Storefront, ReturnDestination.Home)); response.complete();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(store.snapshot.stage).toBe(LoginStage.CollectCredentials);
  });
  it('unknown response and transport failures never navigate or retain secrets', () => {
    submit(); response.next(LoginResult.Unknown); response.complete();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    repository.signIn.mockReturnValue(throwError(() => new Error('offline')));
    submit();
    expect(store.snapshot.password).toBe('');
    expect(store.snapshot.busy).toBe(false);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
