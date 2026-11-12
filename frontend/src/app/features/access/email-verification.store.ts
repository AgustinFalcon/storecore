import { Inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { Observable, Subscription } from 'rxjs';
import { EMAIL_VERIFICATION_REPOSITORY } from '../../core/tokens/email-verification.tokens';
import { CaptureVerificationLinkStep, CompleteEmailVerificationStep, IEmailVerificationRepository, InspectEmailVerificationStep, VerificationLinkResult, VerificationOutcome as Outcome, VerificationStage as Stage } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';
import { ReturnDestination } from '../../domain/access/return-destination';

export interface EmailVerificationViewState { readonly realm: RecoveryRealm; readonly stage: Stage; readonly outcome: Outcome | null; readonly profilePath: string | null; readonly loginDestination: ReturnDestination; }
const INITIAL: EmailVerificationViewState = { realm: RecoveryRealm.Unknown, stage: Stage.Unknown, outcome: null, profilePath: null, loginDestination: ReturnDestination.Home };

@Injectable()
export class EmailVerificationStore extends ComponentStore<EmailVerificationViewState> {
  private readonly capture = new CaptureVerificationLinkStep();
  private readonly inspectStep: InspectEmailVerificationStep;
  private readonly completeStep: CompleteEmailVerificationStep;
  private flight?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private token = '';
  private expiresAt = 0;
  constructor(@Inject(EMAIL_VERIFICATION_REPOSITORY) repository: IEmailVerificationRepository) {
    super(INITIAL); this.inspectStep = new InspectEmailVerificationStep(repository); this.completeStep = new CompleteEmailVerificationStep(repository);
  }
  get snapshot(): EmailVerificationViewState { return this.get(); }
  initialize(fragment: string): void {
    this.clear(); const link = this.capture.capture(fragment); this.token = link.token;
    const destination = link.realm === RecoveryRealm.Customer ? ReturnDestination.CustomerProfile : link.realm === RecoveryRealm.User ? ReturnDestination.UserAccount : ReturnDestination.Home;
    this.setState({ ...INITIAL, realm: link.realm, stage: Stage.Inspecting,
      profilePath: destination.routeFor(link.realm.context), loginDestination: destination });
    if (!this.token) { this.result({ outcome: Outcome.Invalid }); return; }
    this.run(this.inspectStep.execute(link.realm, this.token));
  }
  confirm(): void {
    if (this.snapshot.stage !== Stage.Ready || !this.token) return;
    if (Date.now() >= this.expiresAt) { this.result({ outcome: Outcome.Expired }); return; }
    if (this.timer) clearTimeout(this.timer);
    this.patchState({ stage: Stage.Submitting });
    this.run(this.completeStep.execute(this.snapshot.realm, this.token), true);
  }
  private run(request: Observable<VerificationLinkResult>, completing = false): void {
    const generation = ++this.generation; this.flight?.unsubscribe();
    this.flight = request.subscribe({ next: result => { if (generation === this.generation) this.result(result); }, error: () => { if (generation === this.generation) this.result({ outcome: completing ? Outcome.Uncertain : Outcome.Unavailable }); } });
  }
  private result(result: VerificationLinkResult): void {
    if (result.outcome === Outcome.Ready && result.expiresAt && result.expiresAt > Date.now()) {
      this.expiresAt = result.expiresAt;
      this.patchState({ stage: Stage.Ready, outcome: result.outcome });
      this.timer = setTimeout(() => this.result({ outcome: Outcome.Expired }), Math.min(result.expiresAt - Date.now(), 2_147_483_647));
      return;
    }
    this.token = ''; if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    this.patchState({ stage: Stage.Result, outcome: result.outcome === Outcome.Ready ? Outcome.Expired : result.outcome });
  }
  private clear(): void { ++this.generation; this.flight?.unsubscribe(); if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.token = ''; this.expiresAt = 0; }
  override ngOnDestroy(): void { this.clear(); this.setState(INITIAL); super.ngOnDestroy(); }
}
