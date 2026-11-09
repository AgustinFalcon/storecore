import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { defer, exhaustMap, filter, Subject, takeUntil, tap } from 'rxjs';
import { getApiErrorMessage } from '../../core/api/http-error.util';
import { HomeComposition, validComposition } from '../../domain/content/home-composition';
import { ManageHomeCompositionUseCase } from '../../domain/content/manage-home-composition.usecase';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { UserSessionResult } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';

export interface UserContentState {
  readonly home: HomeComposition;
  readonly published: HomeComposition | null;
  readonly phase: HomeContentPhase;
  readonly errorMessage: string;
  readonly conflict: boolean;
}
const empty = (): HomeComposition => ({ revision: 0, sections: [] });
function copy(home: HomeComposition): HomeComposition {
  return { ...home, sections: home.sections.map(section => ({ ...section, content: { ...section.content,
    ...(section.content.categoryIds ? { categoryIds: [...section.content.categoryIds] } : {}),
    ...(section.content.skus ? { skus: [...section.content.skus] } : {}),
  } })) };
}
export function homeContentDirty(state: UserContentState): boolean {
  return state.published !== null && JSON.stringify(state.home) !== JSON.stringify(state.published);
}
@Injectable()
export class UserContentStore extends ComponentStore<UserContentState> {
  private actorKey: string | null = null;
  private readonly invalidated = new Subject<void>();
  constructor(private readonly content: ManageHomeCompositionUseCase) {
    super({ home: empty(), published: null, phase: HomeContentPhase.AccessDenied, errorMessage: '', conflict: false });
  }
  get snapshot(): UserContentState { return this.get(state => state); }
  get dirty(): boolean { return homeContentDirty(this.snapshot); }
  setActor(actor: UserSessionResult | null): void {
    const key = actor?.roles.includes(UserRole.Admin) ? actor.id : null;
    if (key === this.actorKey) return;
    this.invalidated.next(); this.actorKey = key;
    this.setState({ home: empty(), published: null, phase: key ? HomeContentPhase.Clean : HomeContentPhase.AccessDenied, errorMessage: '', conflict: false });
  }
  readonly edit = this.updater((state, home: HomeComposition) => !this.actorKey || state.phase.busy || !state.published ? state : ({
    ...state, home: copy({ ...home, revision: state.published.revision }),
    phase: state.conflict ? HomeContentPhase.Conflict : JSON.stringify(home) === JSON.stringify(state.published) ? HomeContentPhase.Clean : HomeContentPhase.Editing,
    errorMessage: state.conflict ? state.errorMessage : '',
  }));
  readonly discard = this.updater(state => state.phase.busy || !state.published ? state : ({
    ...state, home: copy(state.published), phase: state.conflict ? HomeContentPhase.Conflict : HomeContentPhase.Clean,
    errorMessage: state.conflict ? state.errorMessage : '',
  }));
  readonly load = this.effect<void>(trigger$ => trigger$.pipe(
    filter(() => this.actorKey !== null && (!this.dirty || this.snapshot.conflict) && !this.snapshot.phase.busy),
    tap(() => this.patchState({ phase: HomeContentPhase.Loading, errorMessage: '' })),
    exhaustMap(() => defer(() => this.content.load()).pipe(takeUntil(this.invalidated), tapResponse({
      next: home => {
        const keepDraft = this.snapshot.conflict && this.dirty;
        this.patchState({ home: copy(keepDraft ? { ...this.snapshot.home, revision: home.revision } : home), published: copy(home), phase: keepDraft ? HomeContentPhase.Editing : HomeContentPhase.Clean, conflict: false, errorMessage: '' });
      },
      error: (error: unknown) => this.patchState({ phase: HomeContentPhase.Error, errorMessage: getApiErrorMessage(error) }),
    }))),
  ));
  readonly publish = this.effect<void>(trigger$ => trigger$.pipe(
    filter(() => this.actorKey !== null && this.dirty && !this.snapshot.phase.busy && !this.snapshot.conflict),
    tap(() => { if (!validComposition(this.snapshot.home)) this.patchState({ phase: HomeContentPhase.Invalid, errorMessage: 'Revisá los campos. Cada bloque necesita un título válido y referencias únicas. Quitá los bloques no compatibles antes de publicar.' }); }),
    filter(() => validComposition(this.snapshot.home)),
    tap(() => this.patchState({ phase: HomeContentPhase.Saving, errorMessage: '' })),
    exhaustMap(() => defer(() => this.content.execute(copy(this.snapshot.home))).pipe(takeUntil(this.invalidated), tapResponse({
      next: home => this.patchState({ home: copy(home), published: copy(home), phase: HomeContentPhase.Success, conflict: false }),
      error: (error: unknown) => {
        const conflict = error instanceof HttpErrorResponse && error.status === 409;
        this.patchState({ conflict, phase: conflict ? HomeContentPhase.Conflict : HomeContentPhase.Error, errorMessage: getApiErrorMessage(error) });
      },
    }))),
  ));
}
