import { HttpErrorResponse } from '@angular/common/http';
import { effect, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { takeUntil } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CalendarMapper } from '../../data/commercial-calendar/calendar.mapper';
import { CalendarChange, CalendarDefinitionInput, CalendarEvent, CalendarOperation, CalendarOutcome, CalendarPreflightResult, CalendarReceipt, CalendarRecoveryState, CalendarRepository, CalendarUseCases } from '../../domain/commercial-calendar/calendar';
import { UserRole } from '../../domain/user/user-role';
import { CalendarCommandJournal, CalendarIntentKind, CalendarPending, CalendarRecovery } from './calendar-command.journal';
export interface CalendarCommandState { readonly busy: boolean; readonly recovery: CalendarRecovery; readonly receipt: CalendarReceipt | null; readonly preflight: CalendarPreflightResult | null; readonly message: string; }
@Injectable()
export class CalendarCommandStore extends ComponentStore<CalendarCommandState> {
  readonly vm = this.selectSignal(state => state);
  private readonly cases: CalendarUseCases;
  private identity = '';
  constructor(repository: CalendarRepository, private readonly session: UserSession, private readonly journal: CalendarCommandJournal) {
    super({ busy:false, recovery:{ status: CalendarRecoveryState.Clear, pending:null }, receipt:null, preflight:null, message:'' }); this.cases = new CalendarUseCases(repository);
    effect(() => { const actor = this.actor(); if (actor === this.identity) return; this.identity = actor; this.patchState({ busy:false, recovery:this.recover(), receipt:null, preflight:null, message:'' }); });
  }
  private actor(): string { return `${this.session.authenticationEpoch()}:${this.session.authenticated()}:${this.session.principal()?.id}:${this.session.roles().map(role => role.wire).join(',')}`; }
  private allowed(): boolean { return this.identity === this.actor() && this.session.authenticated() && this.session.roles().includes(UserRole.Admin); }
  private recover(): CalendarRecovery { return this.journal.recover(this.session.authenticationEpoch(), this.session.principal()?.id ?? ''); }
  clearReview(): void { this.patchState({ preflight:null }); }
  create(definition: CalendarDefinitionInput): void { this.begin({ commandId:crypto.randomUUID(), kind:CalendarIntentKind.Create, eventId:null, definition, change:null, expectedRevision:null }); }
  preflight(event: CalendarEvent): void { this.begin({ commandId:crypto.randomUUID(), kind:CalendarIntentKind.Preflight, eventId:event.id, expectedRevision:event.revision, definition:null, change:null }); }
  change(event: CalendarEvent, change: CalendarChange): void {
    if (change.expectedRevision !== event.revision || !event.lifecycle.allows(change.operation)) return;
    this.begin({ commandId:crypto.randomUUID(), kind:CalendarIntentKind.Change, eventId:event.id, expectedRevision:event.revision, definition:null, change });
  }
  private begin(pending: CalendarPending): void {
    if (!this.allowed() || this.get().busy || this.recover().status !== CalendarRecoveryState.Clear) return;
    if (!this.journal.begin(this.session.authenticationEpoch(), this.session.principal()!.id, pending)) { this.patchState({ recovery:this.recover(), message:'No se pudo guardar el comando. No se envió.' }); return; }
    const durable = this.recover().pending;
    if (durable) this.execute(durable, false);
  }
  recoverCommand(): void { const pending = this.recover().pending; if (this.allowed() && !this.get().busy && pending) this.execute(pending, true); }
  private execute(pending: CalendarPending, lookup: boolean): void {
    const actor = this.identity, epoch = this.session.authenticationEpoch(), actorId = this.session.principal()!.id;
    this.patchState({ busy:true, recovery:this.recover(), message:'', receipt:null });
    const uncertain = (): void => { if (actor === this.actor()) this.patchState({ busy:false, recovery:this.recover(), message:'Resultado incierto. Recuperá el mismo comando antes de realizar otra acción.' }); };
    const release = (): void => this.journal.release(epoch, actorId, pending.commandId);
    const receipt = (value: CalendarReceipt): void => {
      if (actor !== this.actor()) return;
      const operation = pending.kind === CalendarIntentKind.Create ? CalendarOperation.Create : pending.change!.operation;
      if (value.commandId !== pending.commandId || value.actorId !== actorId || value.operation !== operation || value.expectedRevision !== pending.expectedRevision || value.outcome === CalendarOutcome.Unknown || pending.eventId !== null && value.eventId !== pending.eventId || value.after.id !== value.eventId || pending.change && value.reason !== pending.change.reason || pending.kind === CalendarIntentKind.Create && (value.reason !== null || value.before !== null)) { uncertain(); return; }
      const definition = pending.definition ?? pending.change?.definition;
      if (value.outcome === CalendarOutcome.Applied && definition && JSON.stringify(CalendarMapper.definitionInput(value.after.definition)) !== JSON.stringify(CalendarMapper.definitionInput(definition))) { uncertain(); return; }
      release(); this.patchState({ busy:false, recovery:this.recover(), receipt:value, preflight:null, message:value.outcome.label });
    };
    const send = (): void => {
      if (pending.kind === CalendarIntentKind.Preflight) {
        this.cases.preflight(pending.eventId!, pending.commandId, pending.expectedRevision!).pipe(takeUntil(this.destroy$)).subscribe({ next:value => {
          if (actor !== this.actor()) return;
          const snapshot = value.preflight;
          if (value.event.id !== pending.eventId || value.outcome === CalendarOutcome.Unknown || snapshot && (snapshot.eventId !== pending.eventId || snapshot.revision !== pending.expectedRevision || snapshot.revision !== value.event.revision || snapshot.definitionRevision !== value.event.definition.definitionRevision || snapshot.definitionHash !== value.event.definition.hash)) { uncertain(); return; }
          release(); this.patchState({ busy:false, recovery:this.recover(), preflight:value, message:value.outcome.label });
        }, error:uncertain });
      } else {
        const request = pending.kind === CalendarIntentKind.Create ? this.cases.create(pending.commandId, pending.definition!) : this.cases.change(pending.eventId!, pending.commandId, pending.change!);
        request.pipe(takeUntil(this.destroy$)).subscribe({next:receipt, error:uncertain});
      }
    };
    if (!lookup || pending.kind === CalendarIntentKind.Preflight) { send(); return; }
    const request = pending.kind === CalendarIntentKind.Create ? this.cases.createReceipt(pending.commandId) : this.cases.receipt(pending.eventId!, pending.commandId);
    request.pipe(takeUntil(this.destroy$)).subscribe({ next:receipt, error:error => { if (actor !== this.actor()) return; if (error instanceof HttpErrorResponse && error.status === 404) send(); else uncertain(); } });
  }
}
