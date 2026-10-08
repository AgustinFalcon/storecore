import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { Observable, Subscription, timer } from 'rxjs';
import { ACCESS_REPOSITORY } from '../../core/tokens/access.tokens';
import { AccessRepository } from '../../domain/access/access.repository';
import { AuthenticateStep, CollectCredentialsStep, CompleteAccessStep, SelectContextStep } from '../../domain/access/access.steps';
import { IdentityRealm, LoginResolution, LoginResolutionKind, LoginStage } from '../../domain/access/access.types';

export interface AccessState {
  readonly stage: LoginStage;
  readonly email: string;
  readonly password: string;
  readonly resolution: LoginResolution;
  readonly validationMessage: string;
}
const initial: AccessState = { stage: LoginStage.CollectCredentials, email: '', password: '', resolution: LoginResolution.Unknown, validationMessage: '' };

@Injectable()
export class AccessStore extends ComponentStore<AccessState> {
  private readonly collection = new CollectCredentialsStep();
  private readonly authentication: AuthenticateStep;
  private readonly selection: SelectContextStep;
  private readonly completion = new CompleteAccessStep();
  private expiry?: Subscription;
  private request?: Subscription;
  private returnPath: unknown;
  constructor(@Inject(ACCESS_REPOSITORY) repository: AccessRepository, private readonly router: Router) {
    super(initial);
    this.authentication = new AuthenticateStep(repository);
    this.selection = new SelectContextStep(repository);
  }
  get snapshot(): AccessState { return this.get(); }
  setReturnPath(path: unknown): void { this.returnPath = path; }
  readonly setEmail = this.updater((state, email: string) => state.stage.busy ? state : { ...state, email });
  readonly setPassword = this.updater((state, password: string) => state.stage.busy ? state : { ...state, password });
  submit(): void {
    if (this.snapshot.stage.busy || !this.snapshot.stage.collecting) return;
    const credentials = this.collection.collect(this.snapshot.email, this.snapshot.password, this.returnPath);
    if (!credentials) {
      this.patchState({ validationMessage: 'Ingresá un email y una contraseña de entre 12 y 128 caracteres.' });
      return;
    }
    this.patchState({ stage: LoginStage.Authenticate, password: '', validationMessage: '', resolution: LoginResolution.Unknown });
    this.run(this.authentication.execute(credentials));
  }
  selectContext(realm: IdentityRealm): void {
    if (this.snapshot.stage !== LoginStage.SelectContext) return;
    const request = this.selection.execute(this.snapshot.resolution, realm, Date.now());
    if (!request) {
      if (this.snapshot.resolution.expiresAt <= Date.now()) this.reset(LoginStage.Expired);
      return;
    }
    this.expiry?.unsubscribe();
    this.patchState({ stage: LoginStage.IssueSession });
    this.run(request);
  }
  restart(): void {
    if (this.snapshot.stage.busy) return;
    this.reset(LoginStage.CollectCredentials);
  }
  private run(request: Observable<LoginResolution>): void {
    this.request = request.subscribe({
      next: resolution => {
        if (resolution.kind === LoginResolutionKind.ContextSelectionRequired) {
          if (this.snapshot.stage === LoginStage.IssueSession) { this.reset(LoginStage.Unknown); return; }
          const remaining = resolution.expiresAt - Date.now();
          if (remaining <= 0) { this.reset(LoginStage.Expired); return; }
          this.patchState({ stage: LoginStage.SelectContext, resolution });
          this.expiry = timer(Math.min(remaining, 120000)).subscribe(() => this.reset(LoginStage.Expired));
          return;
        }
        const route = this.completion.execute(resolution);
        if (route) {
          this.patchState({ stage: LoginStage.CompleteAccess, resolution: LoginResolution.Unknown });
          void this.router.navigateByUrl(route, { replaceUrl: true }).then(ok => {
            if (!ok) this.reset(LoginStage.Error);
          }).catch(() => this.reset(LoginStage.Error));
        } else this.reset(resolution.kind === LoginResolutionKind.Rejected ? LoginStage.Rejected : LoginStage.Unknown);
      },
      error: () => this.reset(LoginStage.Error),
    });
  }
  private reset(stage: LoginStage): void {
    this.expiry?.unsubscribe();
    this.patchState({ stage, password: '', resolution: LoginResolution.Unknown, validationMessage: '' });
  }
  override ngOnDestroy(): void {
    this.expiry?.unsubscribe();
    this.request?.unsubscribe();
    this.returnPath = undefined;
    super.ngOnDestroy();
  }
}
