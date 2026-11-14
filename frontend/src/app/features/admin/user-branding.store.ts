import { Injectable, OnDestroy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentStore } from '@ngrx/component-store';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { ManageBrandingUseCase } from '../../domain/branding/branding.repository';
import { BrandingAuthorityError, BrandingDraft, BrandingPhase, MerchantBranding } from '../../domain/branding/merchant-branding';
import { UserRole } from '../../domain/user/user-role';
import { UserSession } from '../../core/auth/user-session';
import { StoreBrandingStore } from '../shell/store-branding.store';
import { UserBrandingState } from './user-branding.state';
const empty = (): UserBrandingState => ({ dirty: false, draft: MerchantBranding.Default.draft(), published: null, phase: BrandingPhase.AccessDenied, conflict: false, error: '' });
@Injectable()
export class UserBrandingStore extends ComponentStore<UserBrandingState> implements OnDestroy {
  private actor: string | null = null;
  private generation = 0;
  private readonly invalidated = new Subject<void>();
  private readonly requests = new Subscription();
  constructor(private readonly manage: ManageBrandingUseCase, private readonly publicBranding: StoreBrandingStore, private readonly session: UserSession) { super(empty()); }
  get snapshot(): UserBrandingState { return this.get(s => s); }
  get dirty(): boolean { return this.snapshot.dirty; }
  get valid(): boolean { return !!this.snapshot.published && !!MerchantBranding.validateDraft(this.snapshot.draft, this.snapshot.published.revision); }
  private actorKey(): string | null {
    const principal = this.session.authenticated() ? this.session.principal() : null;
    return principal?.roles.includes(UserRole.Admin) ? principal.id + ':' + this.session.authenticationEpoch() : null;
  }
  syncActor(): boolean {
    const key = this.actorKey();
    if (key === this.actor) return false;
    this.invalidated.next(); ++this.generation; this.actor = key;
    this.setState({ ...empty(), phase: key ? BrandingPhase.Clean : BrandingPhase.AccessDenied });
    return true;
  }
  private current(generation: number): boolean {
    this.syncActor();
    return this.actor !== null && generation === this.generation;
  }
  edit(draft: BrandingDraft): void {
    this.syncActor();
    if (!this.actor || !this.snapshot.published || this.snapshot.phase.busy) return;
    this.patchState({ draft: { ...draft }, dirty: JSON.stringify(draft) !== JSON.stringify(this.snapshot.published?.draft()), phase: this.snapshot.conflict ? BrandingPhase.Conflict : BrandingPhase.Editing, error: this.snapshot.conflict ? this.snapshot.error : '' });
  }
  discard(): void {
    this.syncActor();
    if (this.snapshot.phase.busy || !this.snapshot.published) return;
    this.patchState({ dirty: false, draft: this.snapshot.published.draft(), phase: this.snapshot.conflict ? BrandingPhase.Conflict : BrandingPhase.Clean });
  }
  load(discardConfirmed = false): void {
    this.syncActor();
    if (!this.actor || this.snapshot.phase.busy || this.dirty && !discardConfirmed) return;
    const generation = ++this.generation;
    this.patchState({ phase: BrandingPhase.Loading, error: '' });
    this.requests.add(this.manage.load().pipe(takeUntil(this.invalidated)).subscribe({
      next: value => {
        if (!this.current(generation)) return;
        if (!value || value.revision <= 0) { this.malformed(); return; }
        this.patchState({ published: value, draft: value.draft(), dirty: false, phase: BrandingPhase.Clean, conflict: false, error: '' });
      },
      error: () => { if (this.current(generation)) this.malformed(); },
    }));
  }
  private malformed(): void {
    // Keep the same-actor draft for recovery, but revoke its authority to publish.
    this.patchState({ published: null, phase: BrandingPhase.Error, error: 'No pudimos verificar la apariencia publicada. Recargá para volver a editar.' });
  }
  publish(): void {
    this.syncActor();
    const state = this.snapshot;
    if (!this.actor || state.phase.busy || state.conflict || !state.published || !this.dirty) return;
    if (!this.valid) { this.patchState({ phase: BrandingPhase.Invalid, error: 'Revisá el nombre, el logo HTTPS o /assets/ y el contraste mínimo de 4,5:1.' }); return; }
    const generation = ++this.generation;
    this.patchState({ phase: BrandingPhase.Saving, error: '' });
    this.requests.add(this.manage.execute(state.draft, state.published.revision).pipe(takeUntil(this.invalidated)).subscribe({
      next: value => {
        if (!this.current(generation)) return;
        this.publicBranding.published(value);
        this.patchState({ published: value, draft: value.draft(), dirty: false, phase: BrandingPhase.Success, conflict: false, error: '' });
      },
      error: error => {
        if (!this.current(generation)) return;
        if (error instanceof BrandingAuthorityError) { this.malformed(); return; }
        const conflict = error instanceof HttpErrorResponse && error.status === 409;
        this.patchState({ phase: conflict ? BrandingPhase.Conflict : BrandingPhase.Error, conflict,
          error: conflict ? 'La apariencia cambió desde que empezaste. Tu borrador se conserva. Recargá para revisar la versión publicada.' : 'No pudimos publicar. Tu borrador se conserva; podés reintentar.' });
      },
    }));
  }
  override ngOnDestroy(): void { this.invalidated.next(); this.invalidated.complete(); this.requests.unsubscribe(); super.ngOnDestroy(); }
}
