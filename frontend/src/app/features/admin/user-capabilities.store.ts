import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, EMPTY, switchMap, takeUntil } from 'rxjs';
import { getApiErrorCode, getApiErrorMessage } from '../../core/api/http-error.util';
import { ApiErrorCode } from '../../core/api/api-error-code';
import { CapabilityMutationPhase } from '../../domain/user/capability-mutation-phase';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityStateIntent } from '../../domain/user/capability-state-intent';
import { ChangeCapabilityStateUseCase } from '../../domain/user/use-cases/change-capability-state.usecase';
import { CapabilityFilter } from '../../domain/user/capability-filter';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityTargetPolicy } from '../../domain/user/capability-target-policy';
import { UserRole } from '../../domain/user/user-role';
import { CapabilityModule, UserSessionResult } from '../../domain/user/user.entity';
import { ReadCapabilitiesUseCase } from '../../domain/user/use-cases/read-capabilities.usecase';
import { CapabilityReadState } from './capability-read-state';
import { CapabilityCommandJournal } from './capability-command.journal';

export interface UserCapabilitiesState {
  readonly canMutate: boolean;
  readonly mutationLocked: boolean;
  readonly phase: CapabilityMutationPhase;
  readonly draft: CapabilityDraft | null;
  readonly intent: CapabilityStateIntent | null;
  readonly mutationMessage: string;
  readonly modules: readonly CapabilityModule[];
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly readState: CapabilityReadState;
  readonly hasSnapshot: boolean;
  readonly query: string;
  readonly filter: CapabilityFilter;
  readonly selectedModule: CapabilityModuleId | null;
  readonly policy: CapabilityTargetPolicy;
}

export interface CapabilityDraft { readonly row: CapabilityModule; readonly target: CapabilityModuleState; readonly reason: string; readonly reviewedVersion: boolean; }

function initialState(): UserCapabilitiesState {
  return { modules: [], loading: false, errorMessage: '', readState: CapabilityReadState.Idle,
    hasSnapshot: false, query: '', filter: CapabilityFilter.All, selectedModule: null,
    policy: CapabilityTargetPolicy.Productive, canMutate: false, mutationLocked: false,
    phase: CapabilityMutationPhase.Idle, draft: null, intent: null, mutationMessage: '' };
}

@Injectable()
export class UserCapabilitiesStore extends ComponentStore<UserCapabilitiesState> {
  private actorKey: string | null = null;
  private generation = 0;
  private readId = 0;
  private pending: CapabilityStateIntent | null = null;
  private actorEpoch = '';

  constructor(private readonly readCapabilities: ReadCapabilitiesUseCase, private readonly changeCapability: ChangeCapabilityStateUseCase,
    private readonly journal: CapabilityCommandJournal = new CapabilityCommandJournal()) { super(initialState()); }

  get snapshot(): UserCapabilitiesState { return this.get((state) => state); }
  readonly vm$ = this.select((state) => state);
  readonly modules$ = this.select((state) => state.modules);
  readonly loading$ = this.select((state) => state.loading);
  readonly errorMessage$ = this.select((state) => state.errorMessage);
  readonly readState$ = this.select((state) => state.readState);
  readonly setQuery = this.updater((state, query: string) => ({ ...state, query }));
  readonly setFilter = this.updater((state, filter: CapabilityFilter) => ({ ...state, filter }));
  readonly selectModule = this.updater((state, selectedModule: CapabilityModuleId | null) => ({ ...state, selectedModule }));
  readonly clearFilters = (): void => this.patchState({ query: '', filter: CapabilityFilter.All });

  setActor(principal: UserSessionResult | null, authenticationEpoch = ''): boolean {
    const policy = CapabilityTargetPolicy.Productive;
    const roles = principal?.roles.filter((role) => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const actorKey = principal?.id.trim() && policy.permits(roles)
      ? JSON.stringify([principal.id, roles.map((role) => role.wire).sort(), authenticationEpoch]) : null;
    if (actorKey === this.actorKey) return false;
    this.actorKey = actorKey;
    this.actorEpoch = authenticationEpoch;
    this.generation += 1;
    this.readId += 1;
    this.pending = null;
    const recovery = this.journal.recover(authenticationEpoch);
    const intent = actorKey !== null ? recovery.intent : null;
    this.setState({ ...initialState(), canMutate: actorKey !== null && policy.permitsMutation(roles), mutationLocked: recovery.locked,
      phase: actorKey !== null && recovery.locked ? CapabilityMutationPhase.ResultUncertain : CapabilityMutationPhase.Idle,
      intent, draft: intent ? { row: { id: intent.module, state: intent.current, configVersion: intent.expectedConfigVersion },
        target: intent.target, reason: intent.reason, reviewedVersion: false } : null });
    return true;
  }

  beginEdit(row: CapabilityModule): void {
    if (!this.snapshot.canMutate || this.snapshot.loading || this.pending || this.snapshot.mutationLocked
      || !this.snapshot.modules.includes(row) || !CapabilityStateIntent.canEdit(row)) return;
    this.patchState({ draft: { row, target: CapabilityModuleState.Unknown, reason: '', reviewedVersion: true },
      phase: CapabilityMutationPhase.Editing, intent: null, mutationMessage: '' });
  }
  updateDraft(change: { target?: CapabilityModuleState; reason?: string }): void {
    if (!this.snapshot.draft || this.pending || this.snapshot.mutationLocked) return;
    this.patchState({ draft: { ...this.snapshot.draft, ...change } });
  }
  closeEditor(): void {
    if (this.pending) return;
    if (this.snapshot.phase === CapabilityMutationPhase.ResultUncertain) {
      this.patchState({ draft: null });
      return;
    }
    this.patchState({ draft: null, intent: null, phase: CapabilityMutationPhase.Idle, mutationMessage: '' });
  }
  confirm(): void {
    const state = this.snapshot;
    if (!this.actorKey || !state.canMutate || state.loading || state.mutationLocked || this.pending
      || !state.draft?.reviewedVersion) return;
    let intent: CapabilityStateIntent | null;
    try { intent = CapabilityStateIntent.create(state.draft.row, state.draft.target, state.draft.reason, () => crypto.randomUUID()); }
    catch { this.patchState({ phase: CapabilityMutationPhase.Rejected, mutationMessage: 'No pudimos preparar el cambio.' }); return; }
    if (!intent) return;
    const generation = this.generation;
    const epoch = this.actorEpoch;
    if (!this.journal.begin(epoch, intent)) {
      const recovery = this.journal.recover(epoch);
      this.patchState({ phase: CapabilityMutationPhase.ResultUncertain, mutationLocked: true,
        intent: recovery.intent, mutationMessage: 'No pudimos asegurar el registro del comando. No se envió un nuevo cambio.' });
      return;
    }
    this.pending = intent;
    this.readId += 1;
    this.patchState({ phase: CapabilityMutationPhase.Saving, intent, mutationMessage: '' });
    let command;
    try { command = this.changeCapability.execute(intent); }
    catch {
      this.journal.release(epoch, intent);
      this.pending = null;
      this.patchState({ phase: CapabilityMutationPhase.Rejected, mutationMessage: 'No pudimos preparar el envío del cambio.' });
      return;
    }
    command.pipe(takeUntil(this.destroy$), tapResponse({
      next: row => {
        if (generation !== this.generation || this.pending !== intent) return;
        if (!intent.accepts(row)) { this.uncertain(); return; }
        this.journal.release(epoch, intent);
        this.pending = null;
        this.patchState({ modules: this.snapshot.modules.map(value => value.id === row.id ? row : value),
          phase: CapabilityMutationPhase.Confirmed, draft: null, mutationMessage: '' });
      },
      error: (error: unknown) => {
        if (generation !== this.generation || this.pending !== intent) return;
        this.pending = null;
        if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500) this.journal.release(epoch, intent);
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) { this.deny(error); return; }
        if (error instanceof HttpErrorResponse && error.status === 409 && getApiErrorCode(error) === ApiErrorCode.CapabilityConfigVersionConflict) {
          this.patchState({ phase: CapabilityMutationPhase.Conflict, draft: this.snapshot.draft ? { ...this.snapshot.draft, reviewedVersion: false } : null });
          this.loadCapabilities();
        } else if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500) {
          this.patchState({ phase: CapabilityMutationPhase.Rejected, mutationMessage: getApiErrorMessage(error) });
        } else this.uncertain();
      },
    })).subscribe();
  }

  private uncertain(): void {
    this.pending = null;
    this.patchState({ phase: CapabilityMutationPhase.ResultUncertain, mutationLocked: true });
    this.loadCapabilities();
  }
  private deny(error: unknown): void {
    this.actorKey = null; this.generation += 1; this.readId += 1; this.pending = null;
    this.setState({ ...initialState(), errorMessage: getApiErrorMessage(error), readState: CapabilityReadState.AccessDenied });
  }

  readonly loadCapabilities = this.effect<void>((trigger$) => trigger$.pipe(
    switchMap(() => {
      if (this.pending) return EMPTY;
      const generation = this.generation;
      const readId = ++this.readId;
      if (!this.actorKey) {
        this.setState({ ...initialState(), readState: CapabilityReadState.AccessDenied });
        return EMPTY;
      }
      this.patchState({ loading: true, errorMessage: '',
        readState: this.snapshot.hasSnapshot ? CapabilityReadState.Refreshing : CapabilityReadState.Loading });
      return defer(() => this.readCapabilities.execute()).pipe(tapResponse({
        next: (modules) => {
          if (generation !== this.generation || readId !== this.readId) return;
          this.patchState({ modules, loading: false, errorMessage: '', hasSnapshot: true,
            readState: CapabilityReadState.Ready });
          const draft = this.snapshot.draft;
          if (draft && this.snapshot.phase === CapabilityMutationPhase.Conflict) {
            const row = modules.find(value => value.id === draft.row.id);
            this.patchState({ draft: { ...draft, row: row ?? draft.row, reviewedVersion: !!row && CapabilityStateIntent.canEdit(row) } });
          }
        },
        error: (error: unknown) => {
          if (generation !== this.generation || readId !== this.readId) return;
          const denied = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
          if (denied) {
            this.deny(error);
          } else {
            this.patchState({ loading: false, errorMessage: getApiErrorMessage(error),
              readState: this.snapshot.hasSnapshot ? CapabilityReadState.Stale : CapabilityReadState.Error });
          }
        },
      }));
    }),
  ));
}
