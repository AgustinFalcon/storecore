import { Inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { Observable, Subscription } from 'rxjs';
import { RECOVERY_REPOSITORY } from '../../core/tokens/recovery.tokens';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { CaptureNewPasswordStep, CaptureRecoveryLinkStep, CaptureRecoveryRequestStep, CompleteRecoveryStep, IRecoveryRepository, InspectRecoveryStep, RecoveryOutcome as Outcome, RecoveryRealm, RecoveryResult, RecoveryStage as Stage, RequestRecoveryStep } from '../../domain/access/recovery';

export interface RecoveryViewState {
  readonly realm: RecoveryRealm;
  readonly stage: Stage;
  readonly outcome: Outcome | null;
  readonly email: string;
  readonly password: string;
  readonly confirmation: string;
  readonly error: string;
  readonly retrySeconds: number;
  readonly canRetry: boolean;
}
const INITIAL: RecoveryViewState = { realm: RecoveryRealm.Unknown, stage: Stage.Editing, outcome: null, email: '', password: '', confirmation: '', error: '', retrySeconds: 0, canRetry: false };

@Injectable()
export class RecoveryStore extends ComponentStore<RecoveryViewState> {
  private readonly captureRequest = new CaptureRecoveryRequestStep();
  private readonly capturePassword = new CaptureNewPasswordStep();
  private readonly captureLink = new CaptureRecoveryLinkStep();
  private readonly requestStep: RequestRecoveryStep;
  private readonly inspectStep: InspectRecoveryStep;
  private readonly completeStep: CompleteRecoveryStep;
  private flight?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private token = '';
  private expiresAt = 0;
  private retryAt = 0;
  private reset = false;
  constructor(@Inject(RECOVERY_REPOSITORY) repository: IRecoveryRepository, private readonly coordinator: AccessCoordinator) {
    super(INITIAL);
    this.requestStep = new RequestRecoveryStep(repository);
    this.inspectStep = new InspectRecoveryStep(repository);
    this.completeStep = new CompleteRecoveryStep(repository);
  }
  get snapshot(): RecoveryViewState { return this.get(); }
  initializeRequest(): void { this.clear(); this.reset = false; this.setState(INITIAL); }
  initializeReset(fragment: string): void {
    this.clear(); this.reset = true;
    const link = this.captureLink.capture(fragment);
    this.token = link.token;
    this.setState({ ...INITIAL, realm: link.realm, stage: Stage.Inspecting });
    if (!this.token) { this.result({ outcome: Outcome.Invalid }); return; }
    this.inspect();
  }
  setRealm(raw: unknown): void { if (this.snapshot.stage.editable && !this.reset) this.patchState({ realm: RecoveryRealm.fromWire(raw) }); }
  setEmail(email: string): void { if (this.snapshot.stage.editable) this.patchState({ email }); }
  setPassword(password: string): void { if (this.snapshot.stage.editable) this.patchState({ password }); }
  setConfirmation(confirmation: string): void { if (this.snapshot.stage.editable) this.patchState({ confirmation }); }
  submit(): void {
    if (!this.snapshot.stage.editable) return;
    if (this.reset) {
      if (this.expired()) return;
      const { password, confirmation, realm } = this.snapshot;
      if (!this.capturePassword.accepts(password, confirmation)) {
        this.patchState({ error: 'Ingresá dos contraseñas iguales de 12 a 128 caracteres Unicode.' }); return;
      }
      this.patchState({ stage: Stage.Submitting, error: '', outcome: null, password: '', confirmation: '' });
      this.run(this.completeStep.execute(realm, this.token, password), true);
    } else {
      const { realm, email } = this.snapshot;
      if (!this.captureRequest.accepts(realm, email)) { this.patchState({ error: 'Elegí un acceso e ingresá un email válido.' }); return; }
      this.patchState({ stage: Stage.Submitting, error: '', outcome: null, canRetry: false });
      this.run(this.requestStep.execute(realm, email));
    }
  }
  retry(): void {
    if (!this.snapshot.canRetry || this.snapshot.retrySeconds > 0) return;
    if (this.reset) this.inspect();
    else this.patchState({ stage: Stage.Editing, outcome: null, error: '', canRetry: false });
  }
  private inspect(): void {
    this.patchState({ stage: Stage.Inspecting, outcome: null, canRetry: false, error: '' });
    this.run(this.inspectStep.execute(this.snapshot.realm, this.token));
  }
  private run(request: Observable<RecoveryResult>, completing = false): void {
    const generation = ++this.generation;
    this.flight?.unsubscribe();
    this.flight = request.subscribe({
      next: result => { if (generation === this.generation) this.result(result); },
      error: () => { if (generation === this.generation) this.result({ outcome: completing ? Outcome.Uncertain : Outcome.Unavailable }); },
    });
  }
  private result(result: RecoveryResult): void {
    const outcome = result.outcome;
    if (outcome === Outcome.Completed) this.coordinator.acceptRecovered(this.snapshot.realm.context);
    if (outcome === Outcome.Ready && result.expiresAt) {
      this.expiresAt = result.expiresAt;
      this.patchState({ stage: Stage.Editing, outcome, error: '', canRetry: false });
      if (!this.expired()) this.startTimer();
      return;
    }
    if (outcome === Outcome.PolicyViolation && this.reset) {
      this.patchState({ stage: Stage.Editing, outcome, error: outcome.label, password: '', confirmation: '' }); return;
    }
    if (outcome.terminal) { this.token = ''; this.stopTimer(); }
    if (outcome === Outcome.RateLimited) {
      this.retryAt = Date.now() + (result.retryAfter ?? 60) * 1000;
      this.patchState({ stage: Stage.Cooldown, outcome, error: '', retrySeconds: result.retryAfter ?? 60, password: '', confirmation: '', canRetry: false });
      this.startTimer(); return;
    }
    this.patchState({ stage: Stage.Result, outcome, error: '', password: '', confirmation: '', retrySeconds: 0, canRetry: outcome === Outcome.Accepted || outcome === Outcome.Unavailable || !this.reset && outcome === Outcome.Unknown });
  }
  private expired(): boolean {
    if (this.expiresAt > 0 && Date.now() >= this.expiresAt) { this.result({ outcome: Outcome.Expired }); return true; }
    return false;
  }
  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      // A completion in flight is authoritative; a local clock cannot overwrite it.
      if (this.reset && this.snapshot.stage !== Stage.Submitting && this.snapshot.stage !== Stage.Inspecting && this.expired()) return;
      if (this.snapshot.stage === Stage.Cooldown) {
        const retrySeconds = Math.max(0, Math.ceil((this.retryAt - Date.now()) / 1000));
        this.patchState({ retrySeconds, canRetry: retrySeconds === 0 });
        if (retrySeconds === 0 && !this.reset) this.stopTimer();
      }
    }, 1000);
  }
  private stopTimer(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  private clear(): void { ++this.generation; this.flight?.unsubscribe(); this.stopTimer(); this.token = ''; this.expiresAt = 0; this.retryAt = 0; }
  override ngOnDestroy(): void { this.clear(); this.setState(INITIAL); super.ngOnDestroy(); }
}
