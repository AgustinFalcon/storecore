import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { RECOVERY_REPOSITORY } from '../../core/tokens/recovery.tokens';
import { RecoveryOutcome as Outcome, RecoveryRealm, RecoveryResult, RecoveryStage as Stage } from '../../domain/access/recovery';
import { RecoveryStore } from './recovery.store';

describe('recovery orchestration and races', () => {
  let store: RecoveryStore;
  let repository: { request: ReturnType<typeof vi.fn>; inspect: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> };
  let coordinator: { acceptRecovered: ReturnType<typeof vi.fn> };
  const link = (realm = RecoveryRealm.Customer) => `realm=${realm.wire}&token=${'a'.repeat(43)}`;
  beforeEach(() => {
    vi.useFakeTimers();
    repository = { request: vi.fn(() => of({ outcome: Outcome.Accepted })), inspect: vi.fn(() => of({ outcome: Outcome.Ready, expiresAt: Date.now() + 60_000 })), complete: vi.fn(() => of({ outcome: Outcome.Completed })) };
    coordinator = { acceptRecovered: vi.fn() };
    TestBed.configureTestingModule({ providers: [RecoveryStore, { provide: RECOVERY_REPOSITORY, useValue: repository }, { provide: AccessCoordinator, useValue: coordinator }] });
    store = TestBed.inject(RecoveryStore);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
  it('validates request and exhausts duplicate submit with neutral accepted result', () => {
    const response = new Subject<RecoveryResult>(); repository.request.mockReturnValue(response);
    store.initializeRequest(); store.submit(); expect(repository.request).not.toHaveBeenCalled();
    store.setRealm(RecoveryRealm.Customer.wire); store.setEmail(' absent@example.test '); store.submit(); store.submit();
    expect(repository.request).toHaveBeenCalledExactlyOnceWith(RecoveryRealm.Customer, 'absent@example.test');
    response.next({ outcome: Outcome.Accepted }); response.complete();
    expect(store.snapshot.outcome).toBe(Outcome.Accepted); store.retry(); expect(store.snapshot.stage).toBe(Stage.Editing);
    expect(store.snapshot.email).toBe(' absent@example.test ');
  });
  it('never probes unknown realms, and ignores an old link response after route reuse', () => {
    const old = new Subject<RecoveryResult>(); repository.inspect.mockReturnValue(old);
    store.initializeReset(link()); store.initializeReset('realm=unknown&token=broken');
    old.next({ outcome: Outcome.Ready, expiresAt: Date.now() + 60_000 });
    expect(repository.inspect).toHaveBeenCalledTimes(1); expect(store.snapshot.outcome).toBe(Outcome.Invalid);
    store.submit(); expect(repository.complete).not.toHaveBeenCalled();
  });
  it('clears passwords before awaiting completion and only clears the recovered realm after confirmed success', () => {
    const pending = new Subject<RecoveryResult>(); repository.complete.mockReturnValue(pending);
    store.initializeReset(link(RecoveryRealm.User)); store.setPassword('😀'.repeat(12)); store.setConfirmation('😀'.repeat(12)); store.submit(); store.submit();
    expect(store.snapshot.password).toBe(''); expect(store.snapshot.confirmation).toBe(''); expect(repository.complete).toHaveBeenCalledTimes(1);
    expect(coordinator.acceptRecovered).not.toHaveBeenCalled(); pending.next({ outcome: Outcome.Completed }); pending.complete();
    expect(coordinator.acceptRecovered).toHaveBeenCalledExactlyOnceWith(RecoveryRealm.User.context);
    expect(store.snapshot.outcome).toBe(Outcome.Completed);
  });
  it('blocks expiration during editing but never overwrites an in-flight completion with the local clock', () => {
    repository.inspect.mockImplementation(() => of({ outcome: Outcome.Ready, expiresAt: Date.now() + 1000 }));
    store.initializeReset(link()); vi.advanceTimersByTime(1001); expect(store.snapshot.outcome).toBe(Outcome.Expired);
    store.setPassword('password-long'); store.setConfirmation('password-long'); store.submit(); expect(repository.complete).not.toHaveBeenCalled();
    const pending = new Subject<RecoveryResult>(); repository.complete.mockReturnValue(pending);
    store.initializeReset(link()); store.setPassword('password-long'); store.setConfirmation('password-long'); store.submit();
    vi.advanceTimersByTime(2000); expect(store.snapshot.stage).toBe(Stage.Submitting);
    pending.next({ outcome: Outcome.Completed }); expect(store.snapshot.outcome).toBe(Outcome.Completed);
  });
  it('enforces cooldown, re-inspects before retry and leaves lost completion uncertain', () => {
    repository.inspect.mockReturnValueOnce(of({ outcome: Outcome.RateLimited, retryAfter: 2 }));
    store.initializeReset(link()); store.retry(); expect(repository.inspect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000); expect(store.snapshot.canRetry).toBe(true); store.retry(); expect(repository.inspect).toHaveBeenCalledTimes(2);
    repository.complete.mockReturnValue(of({ outcome: Outcome.Uncertain }));
    store.setPassword('password-long'); store.setConfirmation('password-long'); store.submit(); store.retry();
    expect(store.snapshot.outcome).toBe(Outcome.Uncertain); expect(coordinator.acceptRecovered).not.toHaveBeenCalled();
  });
  it('cancels requests and clears transient secrets on destruction', () => {
    const pending = new Subject<RecoveryResult>(); repository.inspect.mockReturnValue(pending);
    store.initializeReset(link()); store.ngOnDestroy(); pending.next({ outcome: Outcome.Ready, expiresAt: Date.now() + 60_000 });
    expect(store.snapshot).toMatchObject({ realm: RecoveryRealm.Unknown, password: '', confirmation: '' });
  });
  it('replaces stale mismatch or server-policy errors with terminal expiration', () => {
    repository.inspect.mockImplementation(() => of({ outcome: Outcome.Ready, expiresAt: Date.now() + 1000 }));
    store.initializeReset(link()); store.setPassword('password-long'); store.setConfirmation('different-password'); store.submit();
    expect(store.snapshot.error).toBeTruthy();
    vi.advanceTimersByTime(1001);
    expect(store.snapshot).toMatchObject({ outcome: Outcome.Expired, stage: Stage.Result, error: '', password: '', confirmation: '' });
    repository.complete.mockReturnValue(of({ outcome: Outcome.PolicyViolation }));
    store.initializeReset(link()); store.setPassword('password-long'); store.setConfirmation('password-long'); store.submit();
    expect(store.snapshot.error).toBe(Outcome.PolicyViolation.label);
    vi.advanceTimersByTime(1001);
    expect(store.snapshot.outcome).toBe(Outcome.Expired); expect(store.snapshot.error).toBe('');
  });
  it('restarts an unknown request response explicitly without interpreting or replaying it', () => {
    repository.request.mockReturnValue(of({ outcome: Outcome.Unknown }));
    store.initializeRequest(); store.setRealm(RecoveryRealm.Customer.wire); store.setEmail('person@example.test'); store.submit();
    expect(store.snapshot.outcome).toBe(Outcome.Unknown); expect(store.snapshot.canRetry).toBe(true);
    store.retry();
    expect(store.snapshot).toMatchObject({ stage: Stage.Editing, outcome: null, error: '', email: 'person@example.test', realm: RecoveryRealm.Customer });
    expect(repository.request).toHaveBeenCalledTimes(1);
  });
});
