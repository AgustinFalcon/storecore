import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ACCESS_REPOSITORY } from '../../core/tokens/access.tokens';
import { IdentityRealm, LoginResolution, LoginStage } from '../../domain/access/access.types';
import { AccessStore } from './access.store';

describe('AccessStore flow', () => {
  const challenge = () => LoginResolution.fromWire({ kind: 'CONTEXT_SELECTION_REQUIRED', challenge: 'a'.repeat(32), contexts: ['CUSTOMER', 'USER'], expiresAt: new Date(Date.now() + 120000).toISOString() });
  const authenticated = LoginResolution.fromWire({ kind: 'AUTHENTICATED', context: 'CUSTOMER', home: 'STOREFRONT', destination: { kind: 'CATALOG' } });
  const repository = { authenticate: vi.fn(), select: vi.fn() };
  const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [AccessStore, { provide: ACCESS_REPOSITORY, useValue: repository }, { provide: Router, useValue: router }] });
  });
  const signIn = (store: AccessStore) => { store.setEmail('a@b.c'); store.setPassword('password1234'); store.submit(); };
  it('clears password before waiting, rejects duplicate submissions and completes only a closed route', () => {
    const response = new Subject<LoginResolution>(); repository.authenticate.mockReturnValue(response);
    const store = TestBed.inject(AccessStore); store.setReturnPath('//evil.test'); signIn(store); store.submit();
    expect(repository.authenticate).toHaveBeenCalledTimes(1);
    expect(repository.authenticate.mock.calls[0][0].returnPath).toBe('/');
    expect(store.snapshot.password).toBe(''); expect(store.snapshot.stage).toBe(LoginStage.Authenticate);
    response.next(authenticated);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/catalog', { replaceUrl: true });
  });
  it('offers only verified contexts and issues exactly one selection request', () => {
    repository.authenticate.mockReturnValue(of(challenge())); repository.select.mockReturnValue(new Subject<LoginResolution>());
    const store = TestBed.inject(AccessStore); signIn(store);
    expect(store.snapshot.stage).toBe(LoginStage.SelectContext);
    store.selectContext(IdentityRealm.Unknown); expect(repository.select).not.toHaveBeenCalled();
    store.selectContext(IdentityRealm.Customer); store.selectContext(IdentityRealm.User);
    expect(repository.select).toHaveBeenCalledTimes(1);
    expect(store.snapshot.stage).toBe(LoginStage.IssueSession);
  });
  it('expires locally and does not send the challenge after expiry', () => {
    vi.useFakeTimers();
    try {
      repository.authenticate.mockReturnValue(of(challenge()));
      const store = TestBed.inject(AccessStore); signIn(store);
      vi.advanceTimersByTime(120000);
      expect(store.snapshot.stage).toBe(LoginStage.Expired); expect(store.snapshot.resolution).toBe(LoginResolution.Unknown);
      store.selectContext(IdentityRealm.Customer); expect(repository.select).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('drops rejected/unknown/error challenges without navigating or automatic retries', () => {
    const store = TestBed.inject(AccessStore);
    for (const [response, stage] of [[of(LoginResolution.Rejected), LoginStage.Rejected], [of(LoginResolution.Unknown), LoginStage.Unknown], [throwError(() => new Error('secret')), LoginStage.Error]] as const) {
      repository.authenticate.mockReturnValue(response); signIn(store);
      expect(store.snapshot.stage).toBe(stage); expect(store.snapshot.password).toBe('');
      expect(store.snapshot.resolution).toBe(LoginResolution.Unknown);
    }
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('rejects a repeated challenge response after selection without restarting its TTL', () => {
    repository.authenticate.mockReturnValue(of(challenge())); repository.select.mockReturnValue(of(challenge()));
    const store = TestBed.inject(AccessStore); signIn(store); store.selectContext(IdentityRealm.Customer);
    expect(store.snapshot.stage).toBe(LoginStage.Unknown);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
