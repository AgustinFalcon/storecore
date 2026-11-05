import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, exhaustMap, filter, Subject, takeUntil, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { HomeContentDraft, UserSessionResult } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';
import { SaveHomeContentUseCase } from '../../domain/user/use-cases/save-home-content.usecase';

export interface UserContentState {
  readonly home: HomeContentDraft;
  readonly published: HomeContentDraft | null;
  readonly phase: HomeContentPhase;
  readonly errorMessage: string;
}

export function homeContentDirty(state: UserContentState): boolean {
  return state.published !== null && (state.home.title !== state.published.title || state.home.body !== state.published.body);
}

@Injectable()
export class UserContentStore extends ComponentStore<UserContentState> {
  private actorKey: string | null = null;
  private readonly invalidated = new Subject<void>();
  constructor(private readonly content: SaveHomeContentUseCase) {
    super({ home: { title: '', body: '' }, published: null, phase: HomeContentPhase.Loading, errorMessage: '' });
  }

  get snapshot(): UserContentState { return this.get((state) => state); }
  get dirty(): boolean { return homeContentDirty(this.snapshot); }

  setActor(actor: UserSessionResult | null): void {
    const roles = actor?.roles.filter((role) => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const key = actor && roles.length ? actor.id + ':' + roles.map((role) => role.wire).sort().join(',') : null;
    if (key === this.actorKey && key !== null) return;
    this.invalidated.next();
    this.actorKey = key;
    this.setState({ home: { title: '', body: '' }, published: null, phase: key ? HomeContentPhase.Loading : HomeContentPhase.AccessDenied, errorMessage: '' });
  }

  readonly edit = this.updater((state, home: HomeContentDraft) => !this.actorKey || state.phase.busy || state.published === null ? state : ({
    ...state, home: { ...home }, errorMessage: '',
    phase: home.title === state.published.title && home.body === state.published.body ? HomeContentPhase.Clean : HomeContentPhase.Editing,
  }));

  readonly discard = this.updater((state) => state.phase.busy || state.published === null ? state : ({
    ...state, home: { ...state.published }, phase: HomeContentPhase.Clean, errorMessage: '',
  }));

  readonly load = this.effect<void>((trigger$) => trigger$.pipe(
    filter(() => this.actorKey !== null && !this.dirty && this.snapshot.phase !== HomeContentPhase.Saving),
    tap(() => this.patchState({ phase: HomeContentPhase.Loading, errorMessage: '' })),
    exhaustMap(() => defer(() => this.content.load()).pipe(takeUntil(this.invalidated), tapResponse({
      next: (home) => this.patchState({ home: { ...home }, published: { ...home }, phase: HomeContentPhase.Clean }),
      error: (error: unknown) => this.patchState({ phase: HomeContentPhase.Error, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));

  readonly publish = this.effect<void>((trigger$) => trigger$.pipe(
    filter(() => this.actorKey !== null && this.dirty && !this.snapshot.phase.busy),
    tap(() => {
      if (!this.snapshot.home.title.trim()) this.patchState({ phase: HomeContentPhase.Invalid, errorMessage: 'El título es obligatorio.' });
    }),
    filter(() => Boolean(this.snapshot.home.title.trim())),
    tap(() => this.patchState({ phase: HomeContentPhase.Saving, errorMessage: '' })),
    exhaustMap(() => defer(() => this.content.execute({ ...this.snapshot.home })).pipe(takeUntil(this.invalidated), tapResponse({
      next: (home) => this.patchState({ home: { ...home }, published: { ...home }, phase: HomeContentPhase.Success }),
      error: (error: unknown) => this.patchState({ phase: HomeContentPhase.Error, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));
}
