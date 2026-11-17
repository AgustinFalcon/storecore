import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { Subscription } from 'rxjs';
import { ApiErrorCode } from '../../core/api/api-error-code';
import { getApiErrorCode, getApiErrorMessage } from '../../core/api/http-error.util';
import {
  AdminProductOptionsDraft, AdminProductOptionsSnapshot, ConflictResolutionChoice, OptionConflictEntry,
  OptionDraftRebase, OptionEditorPhase, OptionSchemaCommandOperation, optionCommand, optionDraft, optionDraftEquals, validateOptionDraft,
} from '../../domain/catalog/admin-product-options';
import { OptionSchemaState } from '../../domain/catalog/option-schema';
import { ManageProductOptionsUseCase } from '../../domain/catalog/product-options.repository';
import { UserRole } from '../../domain/user/user-role';
import { UserSessionResult } from '../../domain/user/user.entity';

export interface AdminProductOptionsState {
  readonly sku: string;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly phase: OptionEditorPhase;
  readonly message: string;
  readonly base: AdminProductOptionsSnapshot | null;
  readonly draft: AdminProductOptionsDraft | null;
  readonly remote: AdminProductOptionsSnapshot | null;
  readonly conflicts: readonly OptionConflictEntry[];
  readonly choices: ReadonlyMap<string, ConflictResolutionChoice>;
  readonly pendingSku: string;
  readonly clearPending: boolean;
  readonly conflictOperation: OptionSchemaCommandOperation | null;
  readonly uncertainOperation: OptionSchemaCommandOperation | null;
}

const initialState: AdminProductOptionsState = {
  sku: '', canRead: false, canWrite: false, phase: OptionEditorPhase.Idle, message: '', base: null, draft: null,
  remote: null, conflicts: [], choices: new Map(), pendingSku: '', clearPending: false, conflictOperation: null, uncertainOperation: null,
};

export function verifiedOptionsSnapshot(state: Pick<AdminProductOptionsState, 'remote' | 'base'>): AdminProductOptionsSnapshot | null {
  return state.remote ?? state.base;
}

@Injectable()
export class AdminProductOptionsStore extends ComponentStore<AdminProductOptionsState> implements OnDestroy {
  private actorKey: string | null = null;
  private generation = 0;
  private request?: Subscription;

  constructor(private readonly manager: ManageProductOptionsUseCase) { super(initialState); }

  get snapshot(): AdminProductOptionsState { return this.get(state => state); }

  setActor(principal: UserSessionResult | null, authenticationEpoch: string): boolean {
    const roles = principal?.roles.filter(role => role === UserRole.Admin || role === UserRole.Operator) ?? [];
    const key = principal?.id.trim() && roles.length ? JSON.stringify([authenticationEpoch, principal.id, roles.map(role => role.wire).sort()]) : null;
    if (key === this.actorKey) return false;
    this.invalidate(); this.actorKey = key;
    this.setState({ ...initialState, canRead: key !== null, canWrite: roles.includes(UserRole.Admin) });
    return true;
  }

  open(sku: string, discardDirty = false): void {
    const normalized = sku.trim();
    if (!this.snapshot.canRead || !normalized) return;
    if (!discardDirty && this.snapshot.sku && this.isDirty()) {
      this.patchState({ pendingSku: normalized, message: 'Tenés cambios sin publicar. Conservá este producto o descartalos para abrir el nuevo.' });
      return;
    }
    this.load(normalized);
  }

  discardAndOpen(): void { if (this.snapshot.pendingSku) this.load(this.snapshot.pendingSku); }
  keepCurrent(): void { this.patchState({ pendingSku: '', message: '' }); }

  setDraft(draft: AdminProductOptionsDraft): void {
    if (!this.snapshot.canWrite || !this.snapshot.phase.allowsDraft || !this.snapshot.base) return;
    const validation = validateOptionDraft(draft);
    this.patchState({ draft, message: validation.message, phase: OptionEditorPhase.Ready });
  }

  save(): void { this.publish(OptionSchemaCommandOperation.Replace); }
  requestClear(): void { if (this.snapshot.canWrite && this.snapshot.phase.allowsPublish) this.patchState({ clearPending: true }); }
  cancelClear(): void { this.patchState({ clearPending: false }); }
  confirmClear(): void { if (!this.snapshot.clearPending) return; this.patchState({ clearPending: false }); this.publish(OptionSchemaCommandOperation.Clear); }

  refresh(): void {
    const state = this.snapshot;
    if (!state.sku || !state.canRead || state.phase.busy) return;
    if (state.phase === OptionEditorPhase.OutcomeUnknown) this.reconcile();
    else if (state.phase === OptionEditorPhase.RefreshRequired) this.refreshConfirmedWrite();
    else if (state.conflictOperation && state.base && state.draft) this.retryConflictRead();
    else if (this.isDirty()) this.patchState({ pendingSku: state.sku, message: 'Hay cambios sin publicar. Confirmá si querés descartarlos antes de volver a cargar.' });
    else this.load(state.sku);
  }

  choose(path: string, choice: ConflictResolutionChoice): void {
    if (this.snapshot.phase !== OptionEditorPhase.Conflict) return;
    const choices = new Map(this.snapshot.choices); choices.set(path, choice);
    this.patchState({ choices, conflicts: this.snapshot.conflicts.map(row => row.path === path ? { ...row, choice } : row) });
  }

  reapply(): void {
    const state = this.snapshot;
    if (!state.base || !state.draft || !state.remote || state.phase !== OptionEditorPhase.Conflict || state.conflictOperation !== OptionSchemaCommandOperation.Replace) return;
    const merged = OptionDraftRebase.merge(optionDraft(state.base), state.draft, optionDraft(state.remote), state.choices);
    if (!merged) { this.patchState({ message: 'Elegí qué versión conservar en todos los cambios superpuestos.' }); return; }
    const validation = validateOptionDraft(merged);
    this.patchState({ base: state.remote, draft: merged, remote: null, conflicts: [], choices: new Map(), conflictOperation: null, phase: OptionEditorPhase.Ready,
      message: validation.valid ? 'Reaplicación preparada. Revisá el resultado y elegí Guardar para publicarlo.' : `Reaplicación preparada; corregí antes de guardar: ${validation.message}` });
  }

  prepareConflictedClear(): void {
    const state = this.snapshot;
    if (state.phase !== OptionEditorPhase.Conflict || state.conflictOperation !== OptionSchemaCommandOperation.Clear || !state.remote || state.remote.schema.state === OptionSchemaState.Unknown) return;
    this.patchState({ base: state.remote, draft: optionDraft(state.remote), remote: null, conflicts: [], choices: new Map(), conflictOperation: null,
      phase: OptionEditorPhase.Ready, clearPending: true, message: 'La versión publicada cambió. Revisá el impacto actualizado y confirmá nuevamente.' });
  }

  private load(sku: string): void {
    this.invalidate(); const generation = this.generation;
    this.patchState({ sku, pendingSku: '', phase: OptionEditorPhase.Loading, message: '', remote: null, conflicts: [], choices: new Map(), conflictOperation: null, uncertainOperation: null, clearPending: false,
      base: null, draft: null });
    this.request = this.manager.read(sku).subscribe({
      next: value => {
        if (!this.accepts(generation, sku)) return;
        if (value.schema.state === OptionSchemaState.Unknown) {
          this.patchState({ base: value, draft: null, phase: OptionEditorPhase.Error, message: 'El servidor devolvió una configuración no verificable. Volvé a cargar antes de editar.' });
          return;
        }
        this.patchState({ base: value, draft: optionDraft(value), phase: OptionEditorPhase.Ready, message: '', uncertainOperation: null });
      },
      error: error => { if (this.accepts(generation, sku)) this.patchState({ phase: OptionEditorPhase.Error, message: getApiErrorMessage(error) }); },
    });
  }

  private publish(operation: OptionSchemaCommandOperation): void {
    const state = this.snapshot;
    if (!state.canWrite || !state.phase.allowsPublish || !state.base || !state.draft || !state.sku) return;
    if (state.base.schema.state === OptionSchemaState.Unknown) { this.patchState({ message: 'No se puede publicar sobre una configuración no verificable.' }); return; }
    const submittedDraft = state.draft;
    let command;
    try { command = optionCommand(state.base, submittedDraft, operation); }
    catch (error) { this.patchState({ message: error instanceof Error ? error.message : 'Borrador inválido.' }); return; }
    const generation = this.generation, sku = state.sku;
    this.patchState({ phase: OptionEditorPhase.Saving, message: '' });
    this.request = this.manager.write(sku, command).subscribe({
      next: () => {
        if (!this.accepts(generation, sku)) return;
        this.patchState({ phase: OptionEditorPhase.Loading, message: 'Guardado confirmado. Actualizando la configuración publicada…' });
        this.readAfterWrite(generation, sku);
      },
      error: error => { if (this.accepts(generation, sku)) this.writeError(error, submittedDraft, operation); },
    });
  }

  private readAfterWrite(generation: number, sku: string): void {
    this.request = this.manager.read(sku).subscribe({
      next: value => {
        if (!this.accepts(generation, sku)) return;
        if (value.schema.state === OptionSchemaState.Unknown) { this.patchState({ remote: value, phase: OptionEditorPhase.RefreshRequired, message: 'El guardado fue confirmado, pero la relectura no es verificable. Reintentá sólo la actualización.' }); return; }
        this.patchState({ base: value, draft: optionDraft(value), remote: null, conflicts: [], choices: new Map(), conflictOperation: null, uncertainOperation: null, phase: OptionEditorPhase.Success, message: 'Opciones publicadas y verificadas.' });
      },
      error: () => { if (this.accepts(generation, sku)) this.patchState({ phase: OptionEditorPhase.RefreshRequired, message: 'El guardado fue confirmado, pero todavía no pudimos releerlo. Reintentá sólo la actualización.' }); },
    });
  }

  private writeError(error: unknown, localDraft: AdminProductOptionsDraft, operation: OptionSchemaCommandOperation): void {
    const state = this.snapshot;
    if (error instanceof HttpErrorResponse && error.status === 409) {
      if (getApiErrorCode(error) === ApiErrorCode.CatalogOptionRevisionExhausted) {
        this.patchState({ phase: OptionEditorPhase.RevisionExhausted, message: ApiErrorCode.CatalogOptionRevisionExhausted.label }); return;
      }
      this.patchState({ phase: OptionEditorPhase.Loading, conflictOperation: operation, message: 'La configuración cambió. Cargando la versión publicada para comparar…' });
      const generation = this.generation, sku = state.sku;
      this.request = this.manager.read(sku).subscribe({
        next: remote => { if (this.accepts(generation, sku)) this.acceptRemoteConflict(remote, localDraft, operation); },
        error: readError => { if (this.accepts(generation, sku)) this.patchState({ phase: OptionEditorPhase.ConflictReadRequired, message: `Conservamos tu borrador. ${getApiErrorMessage(readError)}` }); },
      });
      return;
    }
    if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500) {
      this.patchState({ phase: OptionEditorPhase.OutcomeUnknown, uncertainOperation: operation, message: 'No sabemos si el guardado llegó al servidor. Verificá la versión publicada; no se reenviará automáticamente.' }); return;
    }
    this.patchState({ canWrite: error.status === 403 ? false : state.canWrite, phase: OptionEditorPhase.Error, message: getApiErrorMessage(error) });
  }

  private reconcile(): void {
    const state = this.snapshot; if (!state.base || !state.draft) return;
    const generation = this.generation, sku = state.sku, localDraft = state.draft, baseRevision = state.base.revision, operation = state.uncertainOperation ?? OptionSchemaCommandOperation.Replace;
    this.patchState({ phase: OptionEditorPhase.Loading, message: 'Verificando la versión publicada…' });
    this.request = this.manager.read(sku).subscribe({
      next: remote => {
        if (!this.accepts(generation, sku)) return;
        if (remote.schema.state === OptionSchemaState.Unknown) { this.patchState({ remote, phase: OptionEditorPhase.OutcomeUnknown, message: 'La versión publicada todavía no es verificable. No se habilitó otra escritura.' }); return; }
        if (remote.revision === baseRevision) this.patchState({ phase: OptionEditorPhase.Ready, uncertainOperation: null, message: 'La revisión no cambió. Conservamos tu borrador para que decidas si querés guardar nuevamente.' });
        else if (operation === OptionSchemaCommandOperation.Clear && remote.schema.state === OptionSchemaState.Absent) this.patchState({ base: remote, draft: optionDraft(remote), uncertainOperation: null, phase: OptionEditorPhase.Success, message: 'La lectura confirma que la configuración fue quitada.' });
        else this.acceptRemoteConflict(remote, localDraft, operation);
      },
      error: error => { if (this.accepts(generation, sku)) this.patchState({ phase: OptionEditorPhase.OutcomeUnknown, message: getApiErrorMessage(error) }); },
    });
  }

  private refreshConfirmedWrite(): void {
    const state = this.snapshot, generation = this.generation, sku = state.sku;
    this.patchState({ phase: OptionEditorPhase.Loading, message: 'Actualizando el guardado ya confirmado…' });
    this.request = this.manager.read(sku).subscribe({
      next: remote => {
        if (!this.accepts(generation, sku)) return;
        if (remote.schema.state === OptionSchemaState.Unknown) { this.patchState({ remote, phase: OptionEditorPhase.RefreshRequired, message: 'El guardado está confirmado, pero la lectura continúa sin ser verificable.' }); return; }
        this.patchState({ base: remote, draft: optionDraft(remote), remote: null, conflicts: [], choices: new Map(), conflictOperation: null, uncertainOperation: null, phase: OptionEditorPhase.Success, message: 'Opciones publicadas y verificadas.' });
      },
      error: error => { if (this.accepts(generation, sku)) this.patchState({ phase: OptionEditorPhase.RefreshRequired, message: getApiErrorMessage(error) }); },
    });
  }

  private acceptRemoteConflict(remote: AdminProductOptionsSnapshot, localDraft: AdminProductOptionsDraft, operation: OptionSchemaCommandOperation): void {
    const base = this.snapshot.base; if (!base) return;
    if (remote.schema.state === OptionSchemaState.Unknown) { this.patchState({ remote, phase: OptionEditorPhase.ConflictReadRequired, message: 'Conservamos tu borrador, pero la versión publicada no es verificable.' }); return; }
    const conflicts = OptionDraftRebase.conflicts(optionDraft(base), localDraft, optionDraft(remote));
    this.patchState({ remote, draft: localDraft, conflicts: operation === OptionSchemaCommandOperation.Clear ? [] : conflicts, choices: new Map(), conflictOperation: operation, phase: OptionEditorPhase.Conflict,
      message: operation === OptionSchemaCommandOperation.Clear ? 'La configuración cambió antes de quitarla. Revisá el impacto actualizado y confirmá nuevamente.'
        : conflicts.length ? 'Revisá los cambios superpuestos. Los cambios independientes se conservarán al reaplicar.' : 'Hay cambios publicados independientes. Reaplicá y revisá antes de guardar.' });
  }

  private retryConflictRead(): void {
    const state = this.snapshot; if (!state.base || !state.draft || !state.conflictOperation) return;
    const generation = this.generation, sku = state.sku, draft = state.draft, operation = state.conflictOperation;
    this.patchState({ phase: OptionEditorPhase.Loading, message: 'Reintentando únicamente la lectura de la versión publicada…' });
    this.request = this.manager.read(sku).subscribe({
      next: remote => { if (this.accepts(generation, sku)) this.acceptRemoteConflict(remote, draft, operation); },
      error: error => { if (this.accepts(generation, sku)) this.patchState({ phase: OptionEditorPhase.ConflictReadRequired, message: `Conservamos tu borrador. ${getApiErrorMessage(error)}` }); },
    });
  }

  private isDirty(): boolean { const state = this.snapshot; return !!state.base && !!state.draft && !optionDraftEquals(optionDraft(state.base), state.draft); }
  private accepts(generation: number, sku: string): boolean { return !!this.actorKey && generation === this.generation && sku === this.snapshot.sku; }
  private invalidate(): void { this.generation++; this.request?.unsubscribe(); this.request = undefined; }
  override ngOnDestroy(): void { this.invalidate(); super.ngOnDestroy(); }
}
