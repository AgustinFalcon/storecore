import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ComponentStore } from '@ngrx/component-store';
import { EMPTY, Observable, catchError, exhaustMap, finalize, switchMap, tap } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { ACCESS_REPOSITORY } from '../../core/tokens/access.tokens';
import { AccessContext } from '../../domain/access/access-context';
import { AccessHome } from '../../domain/access/access-home';
import { IAccessRepository } from '../../domain/access/access.repository';
import { LoginResolution, LoginResult } from '../../domain/access/login-resolution';
import { LoginStage } from '../../domain/access/login-stage';
import { ReturnDestination } from '../../domain/access/return-destination';
import { AccessStateKind } from '../../domain/access/session-probe';
import { AuthenticationStep, ChallengeSelectionStep, CompletionStep, CredentialCaptureStep } from './login-steps';

export interface LoginViewState {
  readonly stage: LoginStage;
  readonly email: string;
  readonly password: string;
  readonly busy: boolean;
  readonly contexts: readonly AccessContext[];
  readonly message: string;
}
const INITIAL_STATE: LoginViewState = { stage: LoginStage.CollectCredentials, email: '', password: '', busy: true, contexts: [], message: '' };

@Injectable()
export class LoginStore extends ComponentStore<LoginViewState> {
  private readonly capture = new CredentialCaptureStep();
  private readonly authentication: AuthenticationStep;
  private readonly selection: ChallengeSelectionStep;
  private readonly completion: CompletionStep;
  private challenge: LoginResult | null = null;
  private destination = ReturnDestination.Home;

  constructor(@Inject(ACCESS_REPOSITORY) repository: IAccessRepository, private readonly coordinator: AccessCoordinator, private readonly router: Router) {
    super(INITIAL_STATE);
    this.authentication = new AuthenticationStep(repository);
    this.selection = new ChallengeSelectionStep(repository);
    this.completion = new CompletionStep(coordinator);
  }
  get snapshot(): LoginViewState { return this.get(); }
  setEmail(email: string): void { if (!this.snapshot.busy) this.patchState({ email }); }
  setPassword(password: string): void { if (!this.snapshot.busy) this.patchState({ password }); }

  readonly initialize = this.effect<ReturnDestination>((destinations$) => destinations$.pipe(exhaustMap((destination) => {
    this.destination = destination === ReturnDestination.Unknown ? ReturnDestination.Home : destination;
    return this.coordinator.rehydrate().pipe(tap((state) => {
      if (state.kind === AccessStateKind.SelectionRequired) this.patchState({ stage: LoginStage.SelectContext, contexts: state.contexts });
      else if (state.kind === AccessStateKind.Selected) {
        const route = this.destination.routeFor(state.activeContext) ?? AccessHome.forContext(state.activeContext).route;
        if (route) void this.router.navigateByUrl(route);
      } else if (state.kind === AccessStateKind.Indeterminate) this.patchState({ message: 'No se pudo comprobar la sesión. Podés intentar ingresar.' });
    }), finalize(() => this.patchState({ busy: false })));
  })));

  /** One shared exhaust lane prevents concurrent credential and challenge mutations. */
  readonly submit = this.effect<AccessContext | void>((commands$) => commands$.pipe(exhaustMap((context) => {
    if (this.snapshot.busy) return EMPTY;
    if (context instanceof AccessContext) {
      if (this.snapshot.stage !== LoginStage.SelectContext || !this.snapshot.contexts.includes(context)) return EMPTY;
      if (!this.challenge) {
        const state = this.coordinator.selectContext(context);
        const route = this.destination.routeFor(context) ?? AccessHome.forContext(context).route;
        if (state.activeContext === context && route) void this.router.navigateByUrl(route);
        this.patchState({ password: '' });
        return EMPTY;
      }
      const challenge = this.challenge;
      this.challenge = null;
      this.patchState({ busy: true, message: '', password: '' });
      this.coordinator.supersedeProbes();
      return this.consume(this.selection.execute(challenge, context), false);
    }
    if (this.snapshot.stage !== LoginStage.CollectCredentials) return EMPTY;
    const credentials = this.capture.capture(this.snapshot.email, this.snapshot.password, this.destination);
    this.patchState({ password: '' });
    if (!credentials) { this.patchState({ message: 'Ingresá un email y una contraseña de 12 a 128 caracteres.' }); return EMPTY; }
    this.patchState({ stage: LoginStage.Authenticate, busy: true, message: '' });
    this.coordinator.supersedeProbes();
    return this.consume(this.authentication.execute(credentials), true);
  })));

  private consume(request: Observable<LoginResult>, allowSelection: boolean): Observable<unknown> {
    return request.pipe(switchMap((result) => {
      if (result.resolution === LoginResolution.ContextSelectionRequired && allowSelection) {
        this.challenge = result;
        this.patchState({ stage: LoginStage.SelectContext, contexts: result.contexts, email: '' });
        return EMPTY;
      }
      if (result.resolution === LoginResolution.Authenticated) return this.completion.execute(result).pipe(tap((route) => {
        if (route) {
          this.patchState({ stage: LoginStage.CompleteAccess, email: '', contexts: [] });
          void this.router.navigateByUrl(route);
        } else this.reject(LoginResolution.Unavailable);
      }));
      this.reject(result.resolution);
      return EMPTY;
    }), catchError(() => { this.reject(LoginResolution.Unavailable); return EMPTY; }), finalize(() => this.patchState({ password: '', busy: false })));
  }
  private reject(resolution: LoginResolution): void {
    this.challenge = null;
    this.patchState({ stage: LoginStage.CollectCredentials, contexts: [], email: '', password: '', message: resolution === LoginResolution.Unavailable ? resolution.label : LoginResolution.Rejected.label });
  }
  override ngOnDestroy(): void {
    this.challenge = null;
    this.patchState({ email: '', password: '', contexts: [] });
    super.ngOnDestroy();
  }
}
