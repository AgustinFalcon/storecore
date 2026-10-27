import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, EMPTY, switchMap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { InventoryFilter } from '../../domain/user/inventory-filter';
import { UserRole } from '../../domain/user/user-role';
import { InventoryRow, UserSessionResult } from '../../domain/user/user.entity';
import { ManageInstallationUseCase } from '../../domain/user/use-cases/manage-installation.usecase';
import { InventoryReadState } from './user-inventory-read-state';

export interface UserInventoryState {
  readonly rows: readonly InventoryRow[];
  readonly loading: boolean;
  readonly errorMessage: string;
  readonly readState: InventoryReadState;
  readonly hasSnapshot: boolean;
  readonly query: string;
  readonly filter: InventoryFilter;
}

function initialState(): UserInventoryState {
  return { rows: [], loading: false, errorMessage: '', readState: InventoryReadState.Idle,
    hasSnapshot: false, query: '', filter: InventoryFilter.All };
}

@Injectable()
export class UserInventoryStore extends ComponentStore<UserInventoryState> {
  private actorKey: string | null = null;
  private generation = 0;

  constructor(private readonly ops: ManageInstallationUseCase) { super(initialState()); }

  get snapshot(): UserInventoryState { return this.get((state) => state); }
  readonly vm$ = this.select((state) => state);
  readonly rows$ = this.select((state) => state.rows);
  readonly loading$ = this.select((state) => state.loading);
  readonly errorMessage$ = this.select((state) => state.errorMessage);
  readonly readState$ = this.select((state) => state.readState);
  readonly setQuery = this.updater((state, query: string) => ({ ...state, query }));
  readonly setFilter = this.updater((state, filter: InventoryFilter) => ({ ...state, filter }));
  readonly clearFilters = (): void => this.patchState({ query: '', filter: InventoryFilter.All });

  setActor(principal: UserSessionResult | null): boolean {
    const roles = principal?.roles.filter((role) => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const actorKey = principal?.id.trim() && roles.length ? JSON.stringify([principal.id, roles.map((role) => role.wire).sort()]) : null;
    if (actorKey === this.actorKey) return false;
    this.actorKey = actorKey;
    this.generation += 1;
    this.setState(initialState());
    return true;
  }

  readonly loadInventory = this.effect<void>((trigger$) => trigger$.pipe(
    switchMap(() => {
      const generation = ++this.generation;
      if (!this.actorKey) {
        this.setState({ ...initialState(), readState: InventoryReadState.AccessDenied });
        return EMPTY;
      }
      this.patchState({
        loading: true,
        errorMessage: '',
        readState: this.snapshot.hasSnapshot ? InventoryReadState.Refreshing : InventoryReadState.Loading,
      });
      return defer(() => this.ops.listInventory()).pipe(tapResponse({
        next: (rows) => {
          if (generation !== this.generation) return;
          this.patchState({ rows, loading: false, errorMessage: '', hasSnapshot: true, readState: InventoryReadState.Ready });
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          const denied = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
          if (denied) {
            this.patchState({ rows: [], hasSnapshot: false, loading: false, errorMessage: getApiErrorMessage(error), readState: InventoryReadState.AccessDenied });
          } else {
            this.patchState({ loading: false, errorMessage: getApiErrorMessage(error),
              readState: this.snapshot.hasSnapshot ? InventoryReadState.Stale : InventoryReadState.Error });
          }
        },
      }));
    }),
  ));
}
