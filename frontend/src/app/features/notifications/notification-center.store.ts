import { takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { effect, Inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { UserSession } from '../../core/auth/user-session';
import { NOTIFICATION_REPOSITORY } from '../../data/notification/notification-http.repository';
import { EmailPreferenceCommand, EmailPreferenceReceipt, NotificationPage, NotificationPreferenceView, NotificationQuery, NotificationRepository, NotificationUseCases } from '../../domain/notification/notification';
import { EmailOperation, EmailPreferenceState, NotificationCategory, NotificationLoadState, NotificationOutcome, NotificationSeverity } from '../../domain/notification/notification-types';
import { UserRole } from '../../domain/user/user-role';
import { NotificationCommandFamily, NotificationCommandJournal, NotificationRecovery } from './notification-command.journal';
interface CenterState { readonly status: NotificationLoadState; readonly query: NotificationQuery; readonly page: NotificationPage | null; readonly preference: NotificationPreferenceView | null; readonly preferenceStatus: NotificationLoadState; readonly busy: boolean; readonly recovery: NotificationRecovery; readonly message: string; }
@Injectable()
export class NotificationCenterStore extends ComponentStore<CenterState> {
  readonly vm = this.selectSignal(state => state);
  private readonly cases: NotificationUseCases;
  private request = 0;
  private preferenceRequest = 0;
  private identity = '';
  constructor(@Inject(NOTIFICATION_REPOSITORY) repository: NotificationRepository, private readonly session: UserSession, private readonly journal: NotificationCommandJournal) {
    super({ status: NotificationLoadState.Loading, query: NotificationQuery.fromWire({}), page: null, preference: null, preferenceStatus: NotificationLoadState.Loading, busy: false, recovery: { locked: false, pending: null }, message: '' });
    this.cases = new NotificationUseCases(repository);
    effect(() => {
      const identity = this.actorIdentity();
      if (this.current(identity)) return;
      this.identity = identity; this.request++; this.preferenceRequest++;
      this.patchState({ page: null, preference: null, busy: false, message: '', recovery: this.recover(), status: this.allowed() ? NotificationLoadState.Loading : NotificationLoadState.Denied });
      if (this.allowed()) { this.load(this.get().query); this.loadPreference(); }
    });
  }
  private allowed(): boolean { return this.session.authenticated() && UserRole.hasKnownRole(this.session.roles()); }
  private actorIdentity(): string { return `${this.session.authenticationEpoch()}:${this.session.authenticated()}:${this.session.principal()?.id}:${this.session.roles().map(x => x.wire).join(',')}`; }
  private current(identity: string): boolean { return identity === this.identity && identity === this.actorIdentity(); }
  private recover(): NotificationRecovery { return this.journal.recover(this.session.authenticationEpoch(), this.session.principal()?.id ?? ''); }
  load(query = this.get().query): void {
    const sequence = ++this.request, identity = this.identity;
    if (!this.allowed()) { this.patchState({ page: null, status: NotificationLoadState.Denied }); return; }
    if (!query.valid) { this.patchState({ query, page: null, status: NotificationLoadState.Invalid }); return; }
    const sameQuery = JSON.stringify(query.toWire()) === JSON.stringify(this.get().query.toWire());
    this.patchState({ query, status: NotificationLoadState.Loading, ...(sameQuery ? {} : { page: null }) });
    this.cases.list(query).pipe(takeUntil(this.destroy$)).subscribe({ next: page => { if (sequence === this.request && this.current(identity)) this.patchState({ page, status: page.items.length ? NotificationLoadState.Ready : NotificationLoadState.Empty }); }, error: error => { if (sequence === this.request && this.current(identity)) this.patchState({ status: this.denied(error) ? NotificationLoadState.Denied : this.get().page ? NotificationLoadState.Stale : NotificationLoadState.Error, ...(this.denied(error) ? { page: null } : {}) }); } });
  }
  loadPreference(): void {
    const sequence = ++this.preferenceRequest, identity = this.identity;
    if (!this.allowed()) return;
    this.patchState({ preferenceStatus: NotificationLoadState.Loading });
    this.cases.preference().pipe(takeUntil(this.destroy$)).subscribe({ next: preference => { if (sequence === this.preferenceRequest && this.current(identity)) this.patchState({ preference, preferenceStatus: NotificationLoadState.Ready }); }, error: error => { if (sequence === this.preferenceRequest && this.current(identity)) this.patchState({ preferenceStatus: this.denied(error) ? NotificationLoadState.Denied : this.get().preference ? NotificationLoadState.Stale : NotificationLoadState.Error, ...(this.denied(error) ? { preference: null } : {}) }); } });
  }
  savePreference(operation: EmailOperation, categories: readonly NotificationCategory[], severities: readonly NotificationSeverity[]): void {
    const state = this.get(), preference = state.preference;
    if (!this.current(this.identity) || !this.allowed() || state.busy || state.recovery.locked || !preference || state.preferenceStatus !== NotificationLoadState.Ready || preference.preference.state === EmailPreferenceState.Unknown || (operation === EmailOperation.Enable && !preference.verified)) return;
    const command: EmailPreferenceCommand = { commandId: crypto.randomUUID(), operation, expectedRevision: preference.preference.revision, categories: operation === EmailOperation.Enable ? categories : [], severities: operation === EmailOperation.Enable ? severities : [] };
    // Validate before persisting the durable recovery intent.
    if (operation === EmailOperation.Unknown || operation === EmailOperation.Enable && (!categories.length || !severities.length)) return;
    const epoch = this.session.authenticationEpoch(), actor = this.session.principal()!.id;
    if (!this.journal.begin(epoch, actor, { family: NotificationCommandFamily.Email, lifecycle: null, email: command })) { this.patchState({ recovery: this.recover(), message: 'No se pudo guardar el comando. No se envió.' }); return; }
    this.execute(command, epoch, actor);
  }
  recoverPreference(): void {
    const state = this.get(), command = state.recovery.pending?.email;
    if (!this.current(this.identity) || !this.allowed() || state.busy || !command) return;
    this.execute(command, this.session.authenticationEpoch(), this.session.principal()!.id);
  }
  private execute(command: EmailPreferenceCommand, epoch: string, actor: string): void {
    const identity = this.identity;
    this.patchState({ busy: true, recovery: this.recover(), message: '' });
    this.cases.savePreference(command).pipe(takeUntil(this.destroy$)).subscribe({ next: receipt => {
      if (!this.current(identity)) return;
      if (!this.matches(receipt, command)) { this.patchState({ busy: false, message: 'No se pudo validar el recibo. Recuperá el mismo comando.' }); return; }
      this.journal.release(epoch, actor, command.commandId);
      this.patchState({ busy: false, recovery: this.recover(), message: receipt.outcome.label }); this.loadPreference();
    }, error: () => { if (this.current(identity)) this.patchState({ busy: false, recovery: this.recover(), message: 'Resultado incierto. Recuperar reenvía exactamente el mismo comando y la misma clave.' }); } });
  }
  private matches(receipt: EmailPreferenceReceipt, command: EmailPreferenceCommand): boolean {
    if (receipt.commandId !== command.commandId || receipt.outcome === NotificationOutcome.Unknown) return false;
    if (receipt.outcome !== NotificationOutcome.Applied) return true;
    const preference = receipt.preference;
    const same = (left: readonly { wire: string }[], right: readonly { wire: string }[]): boolean => left.map(x => x.wire).sort().join(',') === right.map(x => x.wire).sort().join(',');
    return BigInt(preference.revision.wire) === BigInt(command.expectedRevision.wire) + 1n && preference.state === (command.operation === EmailOperation.Enable ? EmailPreferenceState.Enabled : EmailPreferenceState.Disabled) && same(preference.categories, command.categories) && same(preference.severities, command.severities);
  }
  private denied(error: unknown): boolean { return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403); }
}
