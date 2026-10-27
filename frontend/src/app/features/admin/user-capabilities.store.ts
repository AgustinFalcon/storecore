import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, EMPTY, switchMap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { CapabilityFilter } from '../../domain/user/capability-filter';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityTargetPolicy } from '../../domain/user/capability-target-policy';
import { UserRole } from '../../domain/user/user-role';
import { CapabilityModule, UserSessionResult } from '../../domain/user/user.entity';
import { ReadCapabilitiesUseCase } from '../../domain/user/use-cases/read-capabilities.usecase';
import { CapabilityReadState } from './capability-read-state';

export interface UserCapabilitiesState {
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

function initialState(): UserCapabilitiesState {
  return { modules: [], loading: false, errorMessage: '', readState: CapabilityReadState.Idle,
    hasSnapshot: false, query: '', filter: CapabilityFilter.All, selectedModule: null,
    policy: CapabilityTargetPolicy.RealReadOnly };
}

@Injectable()
export class UserCapabilitiesStore extends ComponentStore<UserCapabilitiesState> {
  private actorKey: string | null = null;
  private generation = 0;

  constructor(private readonly readCapabilities: ReadCapabilitiesUseCase) { super(initialState()); }

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

  setActor(principal: UserSessionResult | null): boolean {
    const policy = CapabilityTargetPolicy.RealReadOnly;
    const roles = principal?.roles.filter((role) => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const actorKey = principal?.id.trim() && policy.permits(roles)
      ? JSON.stringify([principal.id, roles.map((role) => role.wire).sort()]) : null;
    if (actorKey === this.actorKey) return false;
    this.actorKey = actorKey;
    this.generation += 1;
    this.setState(initialState());
    return true;
  }

  readonly loadCapabilities = this.effect<void>((trigger$) => trigger$.pipe(
    switchMap(() => {
      const generation = ++this.generation;
      if (!this.actorKey) {
        this.setState({ ...initialState(), readState: CapabilityReadState.AccessDenied });
        return EMPTY;
      }
      this.patchState({ loading: true, errorMessage: '',
        readState: this.snapshot.hasSnapshot ? CapabilityReadState.Refreshing : CapabilityReadState.Loading });
      return defer(() => this.readCapabilities.execute()).pipe(tapResponse({
        next: (modules) => {
          if (generation !== this.generation) return;
          this.patchState({ modules, loading: false, errorMessage: '', hasSnapshot: true,
            readState: CapabilityReadState.Ready });
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          const denied = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
          if (denied) {
            this.patchState({ modules: [], hasSnapshot: false, loading: false,
              errorMessage: getApiErrorMessage(error), readState: CapabilityReadState.AccessDenied,
              selectedModule: null });
          } else {
            this.patchState({ loading: false, errorMessage: getApiErrorMessage(error),
              readState: this.snapshot.hasSnapshot ? CapabilityReadState.Stale : CapabilityReadState.Error });
          }
        },
      }));
    }),
  ));
}
