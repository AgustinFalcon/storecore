import { takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { effect, Inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { UserSession } from '../../core/auth/user-session';
import { NOTIFICATION_REPOSITORY } from '../../data/notification/notification-http.repository';
import { LifecycleCommand, NotificationAlert, NotificationId, NotificationReason, NotificationReceipt, NotificationRepository, NotificationTransitionIntent, NotificationUseCases } from '../../domain/notification/notification';
import { NotificationLoadState } from '../../domain/notification/notification-types';
import { UserRole } from '../../domain/user/user-role';
import { NotificationCommandFamily, NotificationCommandJournal, NotificationRecovery } from './notification-command.journal';
interface DetailState { readonly id: NotificationId; readonly alert: NotificationAlert | null; readonly status: NotificationLoadState; readonly busy: boolean; readonly recovery: NotificationRecovery; readonly receipt: NotificationReceipt | null; readonly message: string; }
@Injectable()
export class NotificationDetailStore extends ComponentStore<DetailState> {
  readonly vm = this.selectSignal(state => state);
  private readonly cases: NotificationUseCases;
  private identity = '';
  private request = 0;
  constructor(@Inject(NOTIFICATION_REPOSITORY) repository: NotificationRepository, readonly session: UserSession, private readonly journal: NotificationCommandJournal) {
    super({ id: NotificationId.Unknown, alert: null, status: NotificationLoadState.Loading, busy: false, recovery: { locked: false, pending: null }, receipt: null, message: '' });
    this.cases = new NotificationUseCases(repository);
    effect(() => {
      const identity = this.actorIdentity();
      if (this.current(identity)) return;
      this.identity = identity; this.request++;
      this.patchState({ alert: null, receipt: null, busy: false, recovery: this.recover(), message: '' });
      this.load(this.get().id);
    });
  }
  private actorIdentity(): string { return `${this.session.authenticationEpoch()}:${this.session.authenticated()}:${this.session.principal()?.id}:${this.session.roles().map(x => x.wire).join(',')}`; }
  private current(identity: string): boolean { return identity === this.identity && identity === this.actorIdentity(); }
  private recover(): NotificationRecovery { return this.journal.recover(this.session.authenticationEpoch(), this.session.principal()?.id ?? ''); }
  load(id = this.get().id): void {
    const sequence = ++this.request, identity = this.identity;
    if (!this.session.authenticated() || !UserRole.hasKnownRole(this.session.roles())) { this.patchState({ id, alert: null, status: NotificationLoadState.Denied }); return; }
    if (id === NotificationId.Unknown) { this.patchState({ id, alert: null, status: NotificationLoadState.Invalid }); return; }
    const changed = id.wire !== this.get().id.wire;
    this.patchState({ id, status: NotificationLoadState.Loading, recovery: this.recover(), ...(changed ? { alert: null, receipt: null, message: '' } : {}) });
    this.cases.detail(id).pipe(takeUntil(this.destroy$)).subscribe({ next: alert => { if (sequence === this.request && this.current(identity)) this.patchState({ alert, status: NotificationLoadState.Ready }); }, error: error => {
      if (sequence !== this.request || !this.current(identity)) return;
      const denied = error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
      this.patchState({ status: denied ? NotificationLoadState.Denied : this.get().alert ? NotificationLoadState.Stale : NotificationLoadState.Error, ...(denied ? { alert: null } : {}), message: error instanceof HttpErrorResponse && error.status === 404 ? 'La notificación no está disponible.' : '' });
    } });
  }
  submit(intent: NotificationTransitionIntent): void {
    const state = this.get(), alert = state.alert, reason = NotificationReason.fromWire(intent.reason), step = intent.step;
    if (!this.current(this.identity) || !this.session.roles().includes(UserRole.Admin) || !this.session.authenticated() || !alert || state.busy || state.recovery.locked || state.status !== NotificationLoadState.Ready || !alert.operations.includes(step) || !step.accepts(alert.lifecycle)) return;
    if (intent.alertId.wire !== alert.id.wire || intent.expectedRevision.wire !== alert.revision.wire) { this.patchState({ message: 'La alerta cambió desde la revisión. Actualizá y revisá nuevamente.' }); return; }
    if (reason === NotificationReason.Unknown) { this.patchState({ message: 'Ingresá un motivo de 1 a 500 caracteres Unicode.' }); return; }
    const command: LifecycleCommand = { commandId: crypto.randomUUID(), alertId: intent.alertId.wire, operation: step, expectedRevision: intent.expectedRevision, reason };
    const epoch = this.session.authenticationEpoch(), actor = this.session.principal()!.id;
    if (!this.journal.begin(epoch, actor, { family: NotificationCommandFamily.Lifecycle, lifecycle: command, email: null })) { this.patchState({ recovery: this.recover(), message: 'No se pudo guardar el comando. No se envió.' }); return; }
    this.execute(command, false);
  }
  recoverCommand(): void {
    const state = this.get(), command = state.recovery.pending?.lifecycle;
    if (!this.current(this.identity) || !this.session.authenticated() || !this.session.roles().includes(UserRole.Admin) || state.busy || !command || command.alertId !== state.id.wire) return;
    this.execute(command, true);
  }
  private execute(command: LifecycleCommand, lookup: boolean): void {
    const identity = this.identity, epoch = this.session.authenticationEpoch(), actor = this.session.principal()!.id;
    this.patchState({ busy: true, recovery: this.recover(), message: '' });
    const accept = (receipt: NotificationReceipt): void => {
      if (!this.current(identity)) return;
      if (receipt.commandId !== command.commandId || receipt.alertId !== command.alertId || receipt.actorId.wire !== actor || receipt.operation !== command.operation || receipt.expectedRevision.wire !== command.expectedRevision.wire || receipt.reason !== command.reason.wire || receipt.before.id.wire !== command.alertId || receipt.after && receipt.after.id.wire !== command.alertId) { uncertain(); return; }
      this.journal.release(epoch, actor, command.commandId);
      this.patchState({ busy: false, recovery: this.recover(), ...(this.get().id.wire === command.alertId ? { receipt, message: receipt.outcome.label } : {}) });
      this.load();
    };
    const uncertain = (): void => { if (this.current(identity)) this.patchState({ busy: false, recovery: this.recover(), message: 'Resultado incierto. Recuperá el recibo antes de intentar otra acción.' }); };
    if (!lookup) { this.cases.submit(command).pipe(takeUntil(this.destroy$)).subscribe({ next: accept, error: uncertain }); return; }
    this.cases.recover(command).pipe(takeUntil(this.destroy$)).subscribe({ next: accept, error: error => {
      // A missing receipt does not prove the prior request never committed: exact replay only.
      if (!this.current(identity)) return;
      if (error instanceof HttpErrorResponse && error.status === 404) this.cases.submit(command).pipe(takeUntil(this.destroy$)).subscribe({ next: accept, error: uncertain }); else uncertain();
    } });
  }
}
