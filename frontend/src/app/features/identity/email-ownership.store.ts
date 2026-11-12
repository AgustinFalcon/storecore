import { Inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { Subscription } from 'rxjs';
import { AccessMutationFence } from '../../core/auth/access-mutation-fence';
import { EMAIL_VERIFICATION_REPOSITORY } from '../../core/tokens/email-verification.tokens';
import { EmailOwnership, IEmailVerificationRepository, ReadEmailOwnershipStep, RequestEmailVerificationStep, VerificationRequestState as RequestState } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';

export interface EmailOwnershipViewState {
  readonly ownership: EmailOwnership;
  readonly request: RequestState;
  readonly loading: boolean;
  readonly retrySeconds: number;
  readonly canRequest: boolean;
}
const INITIAL: EmailOwnershipViewState = { ownership: EmailOwnership.Unknown, request: RequestState.Idle, loading: false, retrySeconds: 0, canRequest: false };

@Injectable()
export class EmailOwnershipStore extends ComponentStore<EmailOwnershipViewState> {
  private readonly readStep: ReadEmailOwnershipStep;
  private readonly requestStep: RequestEmailVerificationStep;
  private realm = RecoveryRealm.Unknown;
  private actor: string | null = null;
  private generation = 0;
  private readGeneration = 0;
  private readFlight?: Subscription;
  private requestFlight?: Subscription;
  private cancellation?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  constructor(@Inject(EMAIL_VERIFICATION_REPOSITORY) repository: IEmailVerificationRepository, private readonly fence: AccessMutationFence) {
    super(INITIAL); this.readStep = new ReadEmailOwnershipStep(repository); this.requestStep = new RequestEmailVerificationStep(repository);
  }
  get snapshot(): EmailOwnershipViewState { return this.get(); }
  bind(realm: RecoveryRealm, actor: string | null): void {
    if (this.realm === realm && this.actor === actor) return;
    this.clear(); this.realm = realm; this.actor = actor;
    this.setState({ ...INITIAL, canRequest: !!actor && realm !== RecoveryRealm.Unknown });
    if (!this.snapshot.canRequest) return;
    this.cancellation = this.fence.cancellation(realm.context).subscribe(() => { this.clear(); this.actor = null; this.setState(INITIAL); });
    this.refresh(true);
  }
  refresh(force = false): void {
    if (!this.actor || this.realm === RecoveryRealm.Unknown || (this.snapshot.loading && !force)) return;
    this.readFlight?.unsubscribe();
    const generation = this.generation, read = ++this.readGeneration;
    this.patchState({ ownership: EmailOwnership.Unknown, loading: true });
    this.readFlight = this.readStep.execute(this.realm).subscribe({
      next: ownership => { if (generation === this.generation && read === this.readGeneration) this.patchState({ ownership, loading: false }); },
      error: () => { if (generation === this.generation && read === this.readGeneration) this.patchState({ ownership: EmailOwnership.Unknown, loading: false }); },
    });
  }
  request(): void {
    if (!this.snapshot.canRequest || this.snapshot.loading || this.snapshot.request.busy || this.snapshot.retrySeconds > 0 || this.snapshot.ownership === EmailOwnership.Verified) return;
    const generation = this.generation;
    this.patchState({ request: RequestState.Submitting });
    this.requestFlight = this.requestStep.execute(this.realm).subscribe({
      next: result => {
        if (generation !== this.generation) return;
        this.patchState({ request: result.state });
        if (result.state === RequestState.Accepted || result.state === RequestState.RateLimited) this.cooldown(result.cooldownSeconds ?? 60);
      },
      error: () => { if (generation === this.generation) this.patchState({ request: RequestState.Unavailable }); },
    });
  }
  private cooldown(seconds: number): void {
    const until = Date.now() + seconds * 1000;
    this.patchState({ retrySeconds: seconds });
    this.timer = setInterval(() => {
      const retrySeconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      this.patchState({ retrySeconds });
      if (retrySeconds === 0) { clearInterval(this.timer); this.timer = undefined; }
    }, 1000);
  }
  private clear(): void {
    ++this.generation; ++this.readGeneration;
    this.readFlight?.unsubscribe(); this.requestFlight?.unsubscribe(); this.cancellation?.unsubscribe();
    if (this.timer) clearInterval(this.timer); this.timer = undefined;
  }
  override ngOnDestroy(): void { this.clear(); this.actor = null; this.setState(INITIAL); super.ngOnDestroy(); }
}
