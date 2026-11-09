import { effect, Injectable, OnDestroy } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { defer, Subject, Subscription, timeout } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { ConfirmDispositionStep, DamageReason, DispositionDraftLine, DispositionPhase, EditDispositionStep, RejectionReason, ReturnDisposition, ReturnDispositionState, ReviewDispositionStep } from '../../domain/order/return-disposition';
import { ManageReturnDispositionUseCase } from '../../domain/order/return-disposition.repository';
import { ReturnDispositionAttempt } from './return-disposition-attempt';

export interface ReturnDispositionViewState {
  readonly phase: DispositionPhase;
  readonly model: ReturnDisposition | null;
  readonly draft: readonly DispositionDraftLine[];
  readonly message: string;
}
const initial = (): ReturnDispositionViewState => ({ phase: DispositionPhase.Loading, model: null, draft: [], message: '' });

@Injectable()
export class ReturnDispositionStore extends ComponentStore<ReturnDispositionViewState> implements OnDestroy {
  readonly vm$ = this.select(state => state);
  private readonly confirmedSubject = new Subject<void>();
  readonly confirmed$ = this.confirmedSubject.asObservable();
  private actor: string | null;
  private orderId = '';
  private returnId: string | null = null;
  private generation = 0;
  private request?: Subscription;
  private readonly editStep = new EditDispositionStep();
  private readonly reviewStep = new ReviewDispositionStep();
  private readonly confirmStep = new ConfirmDispositionStep();
  constructor(private readonly manager: ManageReturnDispositionUseCase, private readonly session: UserSession, private readonly attempt: ReturnDispositionAttempt) {
    super(initial());
    this.actor = this.currentActor();
    effect(() => {
      const actor = this.currentActor();
      if (actor !== this.actor) {
        if (this.actor) this.attempt.clearActor(this.actor);
        this.clearAttempt(); this.generation++; this.request?.unsubscribe(); this.actor = actor;
        this.setState({ ...initial(), phase: DispositionPhase.AccessDenied, message: 'La sesión cambió. Volvé a consultar la orden.' });
      }
    });
  }
  get snapshot(): ReturnDispositionViewState { return this.get(); }
  reset(): void {
    this.clearAttempt(); this.generation++; this.request?.unsubscribe(); this.orderId = '';
    this.setState({ ...initial(), phase: DispositionPhase.ReadOnly });
  }
  private currentActor(): string | null { return this.session.authenticated() && UserRole.hasKnownRole(this.session.roles()) ? this.session.principal()?.id ?? null : null; }
  private hasAccess(): boolean {
    const actor = this.currentActor();
    if (!actor || actor !== this.actor) {
      if (this.actor) this.attempt.clearActor(this.actor);
      this.clearAttempt(); this.generation++; this.request?.unsubscribe(); this.actor = actor;
      this.setState({ ...initial(), phase: DispositionPhase.AccessDenied, message: 'Necesitás una sesión interna con permisos de fulfillment.' });
      return false;
    }
    return true;
  }
  load(orderId: string): void {
    if (orderId !== this.orderId) { this.clearAttempt(); this.orderId = orderId; }
    if (!this.hasAccess() || !/^[1-9]\d*$/.test(orderId)) return;
    const generation = ++this.generation;
    this.request?.unsubscribe(); this.setState(initial());
    this.request = defer(() => this.manager.read(orderId)).pipe(timeout(15000)).subscribe({
      next: model => { if (generation === this.generation && this.hasAccess()) this.accept(model); },
      error: error => { if (generation === this.generation) this.readError(error); },
    });
  }
  change(returnItemId: string, patch: Partial<Omit<DispositionDraftLine, 'returnItemId'>>): void {
    if (!this.hasAccess() || !this.snapshot.phase.canEdit) return;
    this.patchState(state => ({ draft: state.draft.map(line => {
      if (line.returnItemId !== returnItemId) return line;
      const changed = { ...line, ...patch };
      return { ...changed, damageReason: changed.damagedQuantity === 0 ? null : changed.damageReason, rejectionReason: changed.rejectedQuantity === 0 ? null : changed.rejectionReason };
    }), message: '' }));
  }
  damageReason(returnItemId: string, reason: DamageReason | null): void { this.change(returnItemId, { damageReason: reason }); }
  rejectionReason(returnItemId: string, reason: RejectionReason | null): void { this.change(returnItemId, { rejectionReason: reason }); }
  review(): void {
    if (!this.hasAccess() || !this.snapshot.phase.canEdit || !this.snapshot.model) return;
    const message = this.reviewStep.validate(this.snapshot.model, this.snapshot.draft);
    this.patchState(message ? { message } : { phase: DispositionPhase.Reviewing, message: '' });
  }
  back(): void { if (this.hasAccess() && this.snapshot.phase === DispositionPhase.Reviewing) this.patchState({ phase: DispositionPhase.Editing }); }
  confirm(): void {
    if (!this.hasAccess() || this.snapshot.phase !== DispositionPhase.Reviewing || !this.snapshot.model?.returnId || !this.actor) return;
    const model = this.snapshot.model;
    if (this.attempt.read(this.actor, model.returnId!)) { this.recover(); return; }
    const command = this.confirmStep.execute(model, this.snapshot.draft, crypto.randomUUID());
    if (!command) { this.patchState({ phase: DispositionPhase.Editing, message: 'La clasificación cambió. Revisá las cantidades.' }); return; }
    if (!this.attempt.remember(this.actor, model.returnId!, command.idempotencyKey)) { this.patchState({ message: 'No se pudo conservar el intento. Habilitá el almacenamiento de sesión y volvé a intentar.' }); return; }
    const generation = ++this.generation;
    this.patchState({ phase: DispositionPhase.Confirming, message: '' });
    this.request = defer(() => this.manager.confirm(this.orderId, command)).pipe(timeout(15000)).subscribe({
      next: result => { if (generation === this.generation && this.hasAccess()) {
        if (result.state === ReturnDispositionState.Confirmed) this.accept(result);
        else this.patchState({ phase: DispositionPhase.Uncertain, message: 'Consultá el resultado antes de realizar otra inspección.' });
      } },
      error: error => { if (generation === this.generation && this.hasAccess()) {
        const status = this.status(error);
        if (status === 401 || status === 403) { this.clearAttempt(); this.patchState({ phase: DispositionPhase.AccessDenied, draft: [], model: null, message: 'La sesión o los permisos cambiaron.' }); }
        else this.patchState({ phase: status === 409 ? DispositionPhase.Conflict : DispositionPhase.Uncertain, message: status === 409 ? 'La evidencia cambió o la devolución ya fue resuelta. Consultá su estado actual.' : 'No pudimos comprobar la respuesta. El stock puede haberse actualizado; consultá el resultado.' });
      } },
    });
  }
  recover(): void {
    if (!this.hasAccess() || this.snapshot.phase.busy) return;
    const generation = ++this.generation;
    this.patchState({ phase: DispositionPhase.Recovering, draft: [], message: '' });
    this.request = defer(() => this.manager.read(this.orderId)).pipe(timeout(15000)).subscribe({
      next: model => { if (generation === this.generation && this.hasAccess()) this.accept(model); },
      error: error => { if (generation === this.generation) this.readError(error); },
    });
  }
  private accept(model: ReturnDisposition): void {
    if (model.orderId !== this.orderId) { this.patchState({ phase: DispositionPhase.ReadOnly, model: null, draft: [], message: 'La respuesta no corresponde a esta orden.' }); return; }
    this.returnId = model.returnId;
    if (model.state === ReturnDispositionState.Confirmed) {
      const notifyParent = [DispositionPhase.Confirming, DispositionPhase.Recovering, DispositionPhase.Uncertain].includes(this.snapshot.phase);
      this.clearAttempt(); if (this.actor && model.returnId) this.attempt.clear(this.actor, model.returnId);
      this.patchState({ phase: DispositionPhase.Confirmed, model, draft: [], message: 'La clasificación quedó registrada. Sólo las unidades aptas se repusieron.' });
      if (notifyParent) this.confirmedSubject.next();
    } else if (model.state.canEdit) {
      if (this.actor && model.returnId) this.attempt.clear(this.actor, model.returnId);
      this.patchState({ phase: DispositionPhase.Editing, model, draft: this.editStep.execute(model), message: '' });
    } else this.patchState({ phase: DispositionPhase.ReadOnly, model, draft: [], message: model.state.label });
  }
  private status(error: unknown): number { return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 0; }
  private readError(error: unknown): void {
    const denied = [401, 403].includes(this.status(error));
    if (denied) this.clearAttempt();
    this.patchState({ phase: denied ? DispositionPhase.AccessDenied : DispositionPhase.Failed, draft: [], model: null, message: denied ? 'No tenés acceso a la inspección de esta orden.' : 'No pudimos consultar la devolución. Volvé a consultar antes de confirmar.' });
  }
  private clearAttempt(): void { if (this.actor && this.returnId) this.attempt.clear(this.actor, this.returnId); this.returnId = null; }
  override ngOnDestroy(): void { this.generation++; this.request?.unsubscribe(); this.confirmedSubject.complete(); super.ngOnDestroy(); }
}
