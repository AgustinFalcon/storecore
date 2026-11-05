import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, EMPTY, forkJoin, switchMap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { UserRole } from '../../domain/user/user-role';
import { MercadoLibreAccount, MercadoLibreListing, UserSessionResult } from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { MercadoLibreReadPhase } from './mercadolibre-read-phase';

export interface UserMercadoLibreState {
  readonly actor: UserSessionResult | null;
  readonly account: MercadoLibreAccount | null;
  readonly listings: readonly MercadoLibreListing[];
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly readPhase: MercadoLibreReadPhase;
  readonly hasSnapshot: boolean;
  readonly query: string;
}

function initialState(actor: UserSessionResult | null = null): UserMercadoLibreState {
  return {
    actor,
    account: null,
    listings: [],
    loading: false,
    errorMessage: '',
    readPhase: MercadoLibreReadPhase.Idle,
    hasSnapshot: false,
    query: '',
  };
}

@Injectable()
export class UserMercadoLibreStore extends ComponentStore<UserMercadoLibreState> {
  private actorKey: string | null = null;
  private generation = 0;

  constructor(private readonly ops: ManageInstallationUseCase) { super(initialState()); }

  get snapshot(): UserMercadoLibreState { return this.get((state) => state); }
  readonly vm$ = this.select((state) => state);
  readonly setQuery = this.updater((state, query: string) => ({ ...state, query }));
  readonly clearQuery = (): void => this.patchState({ query: '' });

  setActor(principal: UserSessionResult | null): boolean {
    const roles = principal?.roles.filter((role) => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const actor = principal?.id.trim() && roles.length ? { ...principal, id: principal.id.trim(), roles } : null;
    const actorKey = actor ? JSON.stringify([actor.id, roles.map((role) => role.wire).sort()]) : null;
    if (actorKey === this.actorKey) return false;
    this.actorKey = actorKey;
    this.generation += 1;
    this.setState(initialState(actor));
    return true;
  }

  readonly loadMercadoLibre = this.effect<void>((trigger$) => trigger$.pipe(
    switchMap(() => {
      const generation = ++this.generation;
      if (!this.actorKey) {
        this.setState({ ...initialState(), readPhase: MercadoLibreReadPhase.AccessDenied });
        return EMPTY;
      }
      this.patchState({
        loading: true,
        errorMessage: '',
        readPhase: this.snapshot.hasSnapshot ? MercadoLibreReadPhase.Refreshing : MercadoLibreReadPhase.Loading,
      });
      return defer(() => forkJoin({
        account: this.ops.readMercadoLibreAccount(),
        listings: this.ops.listMercadoLibreListings(),
      })).pipe(tapResponse({
        next: ({ account, listings }) => {
          if (generation !== this.generation) return;
          this.patchState({ account, listings, loading: false, errorMessage: '', hasSnapshot: true, readPhase: MercadoLibreReadPhase.Ready });
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          const denied = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
          if (denied) {
            this.setState({ ...initialState(this.snapshot.actor), readPhase: MercadoLibreReadPhase.AccessDenied, errorMessage: getApiErrorMessage(error) });
          } else {
            this.patchState({
              loading: false,
              errorMessage: getApiErrorMessage(error),
              readPhase: this.snapshot.hasSnapshot ? MercadoLibreReadPhase.Stale : MercadoLibreReadPhase.Error,
            });
          }
        },
      }));
    }),
  ));
}
