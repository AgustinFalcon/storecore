import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { EMAIL_VERIFICATION_REPOSITORY } from '../../core/tokens/email-verification.tokens';
import { VerificationLinkResult, VerificationOutcome as Outcome, VerificationStage as Stage } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';
import { ReturnDestination } from '../../domain/access/return-destination';
import { EmailVerificationStore } from './email-verification.store';

describe('scanner-safe email verification orchestration', () => {
  let store: EmailVerificationStore;
  let repository: { inspect: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> };
  const link = (realm = RecoveryRealm.Customer) => `realm=${realm.wire}&token=${'a'.repeat(43)}`;
  beforeEach(() => {
    vi.useFakeTimers(); repository = { inspect: vi.fn(() => of({ outcome: Outcome.Ready, expiresAt: Date.now() + 60_000 })), complete: vi.fn(() => of({ outcome: Outcome.Verified })) };
    TestBed.configureTestingModule({ providers: [EmailVerificationStore, { provide: EMAIL_VERIFICATION_REPOSITORY, useValue: repository }] }); store = TestBed.inject(EmailVerificationStore);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
  it('opening a link only inspects; explicit confirmation completes the exact realm once', () => {
    const pending = new Subject<VerificationLinkResult>(); repository.complete.mockReturnValue(pending);
    store.initialize(link(RecoveryRealm.User)); expect(repository.inspect).toHaveBeenCalledExactlyOnceWith(RecoveryRealm.User, 'a'.repeat(43)); expect(repository.complete).not.toHaveBeenCalled();
    expect(store.snapshot.loginDestination).toBe(ReturnDestination.UserAccount); expect(store.snapshot.profilePath).toBe('/user/account');
    store.confirm(); store.confirm(); expect(repository.complete).toHaveBeenCalledExactlyOnceWith(RecoveryRealm.User, 'a'.repeat(43));
    pending.next({ outcome: Outcome.Verified }); expect(store.snapshot.outcome).toBe(Outcome.Verified); expect(store.snapshot.stage).toBe(Stage.Result);
    store.confirm(); expect(repository.complete).toHaveBeenCalledTimes(1);
  });
  it('never probes unknown, malformed, duplicate or extra fragment parameters', () => {
    for (const raw of ['realm=unknown&token=' + 'a'.repeat(43), link() + '&other=x', link() + '&realm=user', '']) {
      store.initialize(raw); store.confirm(); expect(store.snapshot.outcome).toBe(Outcome.Invalid); expect(store.snapshot.realm).toBe(RecoveryRealm.Unknown);
    }
    expect(repository.inspect).not.toHaveBeenCalled(); expect(repository.complete).not.toHaveBeenCalled();
  });
  it('ignores stale inspection on route reuse and clears transient secret on destruction', () => {
    const old = new Subject<VerificationLinkResult>(); repository.inspect.mockReturnValue(old);
    store.initialize(link()); store.initialize(''); old.next({ outcome: Outcome.Ready, expiresAt: Date.now() + 60_000 }); expect(store.snapshot.outcome).toBe(Outcome.Invalid);
    store.initialize(link()); store.ngOnDestroy(); old.next({ outcome: Outcome.Verified }); expect(store.snapshot.realm).toBe(RecoveryRealm.Unknown); store.confirm(); expect(repository.complete).not.toHaveBeenCalled();
  });
  it('expires a preview without consuming it and never overwrites completion in flight', () => {
    repository.inspect.mockImplementation(() => of({ outcome: Outcome.Ready, expiresAt: Date.now() + 1000 }));
    store.initialize(link()); vi.advanceTimersByTime(1001); store.confirm(); expect(store.snapshot.outcome).toBe(Outcome.Expired); expect(repository.complete).not.toHaveBeenCalled();
    const pending = new Subject<VerificationLinkResult>(); repository.complete.mockReturnValue(pending);
    store.initialize(link()); store.confirm(); vi.advanceTimersByTime(2000); expect(store.snapshot.stage).toBe(Stage.Submitting);
    pending.next({ outcome: Outcome.Verified }); expect(store.snapshot.outcome).toBe(Outcome.Verified);
  });
  it('fails closed on lost completion without replaying and allows no implicit login', () => {
    repository.complete.mockReturnValue(of({ outcome: Outcome.Uncertain })); store.initialize(link()); store.confirm(); store.confirm();
    expect(store.snapshot.outcome).toBe(Outcome.Uncertain); expect(repository.complete).toHaveBeenCalledTimes(1);
    expect(store.snapshot.profilePath).toBe('/customer/profile'); expect(store.snapshot.loginDestination).toBe(ReturnDestination.CustomerProfile);
  });
});
