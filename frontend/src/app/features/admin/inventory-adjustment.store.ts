import { HttpErrorResponse } from '@angular/common/http';
import { effect, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { defer, Subject, switchMap, timeout } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { AdjustAvailableStockCommand, ConfirmInventoryAdjustmentStep, EditInventoryAdjustmentStep, InventoryAdjustmentLookup, InventoryAdjustmentOutcome, InventoryAdjustmentPhase, InventoryAdjustmentReceipt, InventoryAdjustmentRejection, InventoryAdjustmentRequestError, InventoryBalance, RecoverInventoryAdjustmentStep, ReviewInventoryAdjustmentStep } from '../../domain/user/inventory-adjustment';
import { AdjustAvailableStockUseCase } from '../../domain/user/inventory-adjustment.repository';
import { InventoryRow } from '../../domain/user/user.entity';
import { UserRole } from '../../domain/user/user-role';
import { ReadCapabilitiesUseCase } from '../../domain/user/use-cases/read-capabilities.usecase';
import { InventoryAdjustmentAttempt, InventoryAdjustmentAttemptJournal } from './inventory-adjustment-attempt';

export interface InventoryAdjustmentViewState {
  readonly phase: InventoryAdjustmentPhase; readonly visible: boolean; readonly row: InventoryRow | null;
  readonly balance: InventoryBalance | null; readonly delta: string; readonly reason: string;
  readonly message: string; readonly receipt: InventoryAdjustmentReceipt | null; readonly canWrite: boolean;
  readonly pending: boolean; readonly pendingSku: string; readonly invalidDelta: boolean; readonly invalidReason: boolean;
}
const initial = (): InventoryAdjustmentViewState => ({ phase: InventoryAdjustmentPhase.Closed, visible: false, row: null, balance: null, delta: '', reason: '', message: '', receipt: null, canWrite: false, pending: false, pendingSku: '', invalidDelta: false, invalidReason: false });

@Injectable({ providedIn: 'root' })
export class InventoryAdjustmentStore extends ComponentStore<InventoryAdjustmentViewState> {
  readonly vm$ = this.select(state => state);
  private readonly appliedSubject = new Subject<void>();
  readonly applied$ = this.appliedSubject.asObservable();
  private identity: string | null = null;
  private generation = 0;
  private attempt: InventoryAdjustmentAttempt | null = null;
  private reviewed: AdjustAvailableStockCommand | null = null;
  private storageBlocked = false;
  constructor(private readonly session: UserSession, private readonly manager: AdjustAvailableStockUseCase, private readonly capabilities: ReadCapabilitiesUseCase, private readonly journal: InventoryAdjustmentAttemptJournal) {
    super(initial());
    effect(() => {
      const identity = this.currentIdentity();
      if (identity === this.identity) return;
      if (this.identity) this.journal.clear();
      this.identity = identity; this.generation++; this.attempt = null; this.reviewed = null; this.storageBlocked = false;
      this.setState(initial());
      if (identity) {
        try {
          this.attempt = this.journal.read(this.session.principal()!.id, this.session.authenticationEpoch());
          if (this.attempt) this.patchState({ phase: InventoryAdjustmentPhase.OutcomeUnknown, pending: true, pendingSku: this.attempt.sku, message: 'Hay un ajuste pendiente de comprobar. Consultá su resultado antes de realizar otro.' });
        } catch { this.storageBlocked = true; this.patchState({ phase: InventoryAdjustmentPhase.Unknown, message: 'No podemos leer el intento guardado. Habilitá el almacenamiento de sesión para continuar.', pending: true }); }
        this.readAuthority();
      }
    });
  }
  get snapshot(): InventoryAdjustmentViewState { return this.get(); }
  private currentIdentity(): string | null {
    const principal = this.session.principal();
    return this.session.authenticated() && principal?.id && principal.roles.some(role => role === UserRole.Admin || role === UserRole.Operator)
      ? JSON.stringify([principal.id, principal.roles.map(role => role.wire).sort(), this.session.authenticationEpoch()]) : null;
  }
  private authorized(): boolean { return !!this.identity && this.identity === this.currentIdentity(); }
  private validCallback(generation: number, command?: AdjustAvailableStockCommand): boolean { return generation === this.generation && this.authorized() && (!command || command === this.attempt?.command); }
  private readAuthority(): void {
    const generation = this.generation;
    defer(() => this.capabilities.execute()).pipe(timeout(15000)).subscribe({
      next: modules => { if (this.validCallback(generation)) this.patchState({ canWrite: modules.some(module => module.id === CapabilityModuleId.ManualFulfillment && module.state === CapabilityModuleState.Active) }); },
      error: () => { if (this.validCallback(generation)) this.patchState({ canWrite: false }); },
    });
  }
  open(row: InventoryRow, fresh: boolean): void {
    if (!this.authorized() || !this.snapshot.canWrite || this.snapshot.pending || this.storageBlocked || !fresh) return;
    const balance = new EditInventoryAdjustmentStep().execute(row);
    if (!balance) return;
    this.reviewed = null;
    this.patchState({ phase: InventoryAdjustmentPhase.Editing, visible: true, row, balance, delta: '', reason: '', message: '', receipt: null, invalidDelta: false, invalidReason: false });
  }
  change(delta: string, reason: string): void {
    if (this.authorized() && this.snapshot.phase.canEdit) { this.reviewed = null; this.patchState({ delta, reason, message: '', invalidDelta: false, invalidReason: false }); }
  }
  review(): void {
    const state = this.snapshot;
    if (!this.authorized() || !state.phase.canEdit || !state.balance || !state.row || !state.canWrite) return;
    const step = new ReviewInventoryAdjustmentStep(); const message = step.error(state.balance, state.delta, state.reason);
    if (message) { this.patchState({ message, invalidDelta: step.proposed(state.balance, state.delta) === null, invalidReason: !state.reason.trim() || state.reason.trim().length > 500 }); return; }
    this.reviewed = new ConfirmInventoryAdjustmentStep().execute(state.row.variantId, state.balance, state.delta, state.reason, crypto.randomUUID());
    this.patchState({ phase: InventoryAdjustmentPhase.Reviewing, reason: state.reason.trim(), message: '' });
  }
  back(): void { if (this.authorized() && this.snapshot.phase.reviewing) { this.reviewed = null; this.patchState({ phase: InventoryAdjustmentPhase.Editing }); } }
  confirm(): void {
    if (!this.authorized() || !this.snapshot.phase.reviewing || !this.snapshot.canWrite || this.snapshot.pending || !this.reviewed || this.storageBlocked) return;
    const attempt: InventoryAdjustmentAttempt = { version: 1, actor: this.session.principal()!.id, epoch: this.session.authenticationEpoch(), command: this.reviewed, sku: this.snapshot.row!.sku };
    if (!this.journal.remember(attempt)) { this.patchState({ message: 'No se pudo conservar el intento. Habilitá el almacenamiento de sesión; no enviamos el ajuste.' }); return; }
    this.attempt = attempt;
    this.patchState({ phase: InventoryAdjustmentPhase.Submitting, pending: true, pendingSku: attempt.sku, message: '' });
    this.transmit(false);
  }
  private transmit(refreshCsrf: boolean): void {
    if (!this.attempt || !this.authorized()) return;
    const command = this.attempt.command; const generation = this.generation;
    const request = refreshCsrf ? defer(() => this.manager.refreshCsrf()).pipe(switchMap(() => this.validCallback(generation, command) ? this.manager.submit(command) : [])) : defer(() => this.manager.submit(command));
    request.pipe(timeout(15000)).subscribe({
      next: receipt => { if (this.validCallback(generation, command)) this.accept(receipt, command); },
      error: error => { if (this.validCallback(generation, command)) this.requestError(error); },
    });
  }
  private accept(receipt: InventoryAdjustmentReceipt, command: AdjustAvailableStockCommand): void {
    if (!new RecoverInventoryAdjustmentStep().accepts(command, receipt)) { this.uncertain(); return; }
    if (receipt.outcome === InventoryAdjustmentOutcome.Applied && (!receipt.before || !receipt.after || receipt.before.available !== command.expected.available || receipt.before.reserved !== command.expected.reserved || receipt.before.safety !== command.expected.safety || receipt.after.available !== receipt.before.available + command.quantityDelta)) { this.uncertain(); return; }
    if (!this.journal.clear()) {
      this.patchState({ phase: receipt.outcome === InventoryAdjustmentOutcome.Applied ? InventoryAdjustmentPhase.Applied : InventoryAdjustmentPhase.Rejected, receipt, pending: true, message: 'El resultado quedó confirmado. No pudimos liberar el intento guardado; habilitá el almacenamiento y comprobá el resultado para continuar.' });
      if (receipt.outcome === InventoryAdjustmentOutcome.Applied) this.appliedSubject.next();
      return;
    }
    this.attempt = null; this.reviewed = null;
    const applied = receipt.outcome === InventoryAdjustmentOutcome.Applied;
    this.patchState({ phase: applied ? InventoryAdjustmentPhase.Applied : receipt.rejection === InventoryAdjustmentRejection.BalanceChanged ? InventoryAdjustmentPhase.Conflict : InventoryAdjustmentPhase.Rejected, receipt, pending: false, pendingSku: '', message: applied ? 'El ajuste quedó registrado. Los saldos siguientes corresponden al momento de aplicación.' : receipt.rejection.label });
    if (applied || receipt.rejection === InventoryAdjustmentRejection.BalanceChanged) this.appliedSubject.next();
  }
  private uncertain(message = 'No pudimos confirmar el resultado. El ajuste puede haberse aplicado.'): void { this.patchState({ phase: InventoryAdjustmentPhase.OutcomeUnknown, pending: true, message }); }
  private requestError(error: unknown): void {
    if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
      this.patchState({ phase: InventoryAdjustmentPhase.AccessDenied, canWrite: false, row: null, balance: null, delta: '', reason: '', receipt: null, message: 'La sesión o los permisos cambiaron. El intento sigue pendiente de comprobación.' });
      return;
    }
    const envelope = error instanceof HttpErrorResponse ? error.error as { errorCode?: unknown } | null : null;
    this.uncertain(InventoryAdjustmentRequestError.fromWire(envelope?.errorCode).label);
  }
  recover(): void {
    if (!this.authorized() || !this.attempt || this.snapshot.phase.busy) return;
    this.readAuthority();
    const command = this.attempt.command; const generation = this.generation;
    this.patchState({ visible: true, phase: InventoryAdjustmentPhase.Recovering, message: '' });
    defer(() => this.manager.lookup(command)).pipe(timeout(15000)).subscribe({
      next: result => { if (!this.validCallback(generation, command)) return; if (result.lookup === InventoryAdjustmentLookup.Found && result.receipt) this.accept(result.receipt, command); else this.uncertain('Aún no hay un recibo confirmado. Esto no demuestra que el ajuste no se haya aplicado. Podés comprobar de nuevo o reenviar el mismo intento.'); },
      error: error => { if (this.validCallback(generation, command)) this.requestError(error); },
    });
  }
  replay(): void {
    if (!this.authorized() || !this.attempt || !this.snapshot.phase.canRecover || !this.snapshot.canWrite) return;
    this.patchState({ phase: InventoryAdjustmentPhase.Recovering, message: '' }); this.transmit(true);
  }
  reopen(): void { if (this.authorized()) this.patchState({ visible: true }); }
  close(): void { this.patchState({ visible: false }); }
  reviewConflict(row: InventoryRow | undefined, fresh: boolean): void {
    if (!this.authorized() || !this.snapshot.phase.conflict || !row || !fresh || !this.snapshot.canWrite) return;
    const balance = new EditInventoryAdjustmentStep().execute(row); if (!balance) return;
    this.reviewed = null; this.patchState({ phase: InventoryAdjustmentPhase.Editing, row, balance, receipt: null, message: 'El saldo actual se cargó. Revisá nuevamente la variación y el motivo antes de confirmar.' });
  }
}
