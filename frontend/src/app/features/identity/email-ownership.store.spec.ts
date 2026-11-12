import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { EMAIL_VERIFICATION_REPOSITORY } from '../../core/tokens/email-verification.tokens';
import { EmailOwnership, EmailOwnershipReadState as ReadState, VerificationRequestResult, VerificationRequestState as RequestState } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';
import { EmailOwnershipStore } from './email-ownership.store';

describe('separate email ownership and request state', () => {
  let store: EmailOwnershipStore;
  let repository: { ownership: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers(); repository = { ownership: vi.fn(() => of(EmailOwnership.Unknown)), request: vi.fn(() => of({ state: RequestState.Accepted, cooldownSeconds: 60 })) };
    TestBed.configureTestingModule({ providers: [EmailOwnershipStore, { provide: EMAIL_VERIFICATION_REPOSITORY, useValue: repository }] }); store = TestBed.inject(EmailOwnershipStore);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
  it('does not infer ownership from a successful request and enforces its cooldown', () => {
    store.bind(RecoveryRealm.Customer, 'one'); store.request(); store.request();
    expect(store.snapshot.ownership).toBe(EmailOwnership.Unknown); expect(store.snapshot.request).toBe(RequestState.Accepted);
    expect(repository.request).toHaveBeenCalledExactlyOnceWith(RecoveryRealm.Customer); vi.advanceTimersByTime(59_000); store.request(); expect(repository.request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000); store.request(); expect(repository.request).toHaveBeenCalledTimes(2);
  });
  it('exhausts repeated activation and preserves independent ownership on unavailable requests', () => {
    const pending = new Subject<VerificationRequestResult>(); repository.request.mockReturnValue(pending);
    store.bind(RecoveryRealm.User, 'one'); store.request(); store.request(); expect(store.snapshot.request).toBe(RequestState.Submitting); expect(repository.request).toHaveBeenCalledTimes(1);
    pending.next({ state: RequestState.Unavailable }); expect(store.snapshot.request).toBe(RequestState.Unavailable); expect(store.snapshot.ownership).toBe(EmailOwnership.Unknown);
  });
  it('refreshes authoritative ownership after profile save and resets stale verified evidence first', () => {
    repository.ownership.mockReturnValueOnce(of(EmailOwnership.Verified)); store.bind(RecoveryRealm.Customer, 'one'); store.request(); expect(repository.request).not.toHaveBeenCalled();
    const pending = new Subject<EmailOwnership>(); repository.ownership.mockReturnValue(pending); store.refresh(); expect(store.snapshot.ownership).toBe(EmailOwnership.Unknown); expect(store.snapshot.read).toBe(ReadState.Loading);
    pending.next(EmailOwnership.Unknown); expect(store.snapshot.read).toBe(ReadState.Ready); store.request(); expect(repository.request).toHaveBeenCalledTimes(1);
  });
  it('does not restart a pending manual refresh but permits an authoritative forced refresh', () => {
    const first = new Subject<EmailOwnership>(), forced = new Subject<EmailOwnership>();
    repository.ownership.mockReturnValueOnce(first).mockReturnValueOnce(forced);
    store.bind(RecoveryRealm.Customer, 'one');
    store.refresh();
    expect(repository.ownership).toHaveBeenCalledTimes(1);
    store.refresh(true);
    expect(repository.ownership).toHaveBeenCalledTimes(2);
    first.next(EmailOwnership.Verified);
    expect(store.snapshot.ownership).toBe(EmailOwnership.Unknown);
    forced.next(EmailOwnership.Verified);
    expect(store.snapshot.ownership).toBe(EmailOwnership.Verified);
  });
  it('separates an unavailable read from authoritative unknown ownership', () => {
    const pending = new Subject<EmailOwnership>(); repository.ownership.mockReturnValue(pending);
    store.bind(RecoveryRealm.Customer, 'one'); pending.error(new Error('fixture'));
    expect(store.snapshot.ownership).toBe(EmailOwnership.Unknown);
    expect(store.snapshot.read).toBe(ReadState.Unavailable);
    expect(store.snapshot.read.label).not.toBe(EmailOwnership.Unknown.label);
  });
  it('rejects obsolete reads/requests after actor replacement and logout fence', () => {
    const oldRead = new Subject<EmailOwnership>(), oldRequest = new Subject<VerificationRequestResult>();
    repository.ownership.mockReturnValueOnce(oldRead); store.bind(RecoveryRealm.Customer, 'one'); store.bind(RecoveryRealm.Customer, 'two'); oldRead.next(EmailOwnership.Verified); expect(store.snapshot.ownership).toBe(EmailOwnership.Unknown);
    repository.request.mockReturnValue(oldRequest); store.request(); TestBed.inject(AccessMutationFence).advance(RecoveryRealm.Customer.context);
    oldRequest.next({ state: RequestState.Accepted, cooldownSeconds: 60 }); expect(store.snapshot.request).toBe(RequestState.Idle); expect(store.snapshot.canRequest).toBe(false); store.request(); expect(repository.request).toHaveBeenCalledTimes(1);
  });
  it('performs no work for unknown realm or missing principal and clears timers on destruction', () => {
    store.bind(RecoveryRealm.Unknown, 'one'); store.request(); store.refresh(); store.bind(RecoveryRealm.User, null); store.request(); expect(repository.ownership).not.toHaveBeenCalled(); expect(repository.request).not.toHaveBeenCalled();
    store.bind(RecoveryRealm.User, 'one'); store.request(); store.ngOnDestroy(); vi.advanceTimersByTime(60_000); expect(store.snapshot.canRequest).toBe(false); expect(store.snapshot.retrySeconds).toBe(0);
  });
});
