import { Injectable } from '@angular/core';
import { EmailPreferenceCommand, LifecycleCommand, NotificationId, NotificationReason, NotificationRevision } from '../../domain/notification/notification';
import { EmailOperation, NotificationCategory, NotificationSeverity, NotificationStep } from '../../domain/notification/notification-types';

export class NotificationCommandFamily {
  private constructor(readonly wire: string) {}
  static readonly Lifecycle = new NotificationCommandFamily('LIFECYCLE');
  static readonly Email = new NotificationCommandFamily('EMAIL_PREFERENCE');
  static readonly Unknown = new NotificationCommandFamily('UNKNOWN');
  static fromWire(raw: unknown): NotificationCommandFamily { return [this.Lifecycle, this.Email].find(x => x.wire === raw) ?? this.Unknown; }
}
export interface NotificationPending { readonly family: NotificationCommandFamily; readonly lifecycle: LifecycleCommand | null; readonly email: EmailPreferenceCommand | null; }
export interface NotificationRecovery { readonly locked: boolean; readonly pending: NotificationPending | null; }
@Injectable({ providedIn: 'root' })
export class NotificationCommandJournal {
  private readonly key = 'sc:notification-command:v1';
  recover(epoch: string, actor: string): NotificationRecovery {
    try {
      const raw = sessionStorage.getItem(this.key);
      if (raw === null) return { locked: false, pending: null };
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (typeof value?.['epoch'] === 'string' && typeof value['actor'] === 'string' && (value['epoch'] !== epoch || value['actor'] !== actor)) { sessionStorage.removeItem(this.key); return { locked: false, pending: null }; }
      if (!value || Object.keys(value).sort().join(',') !== 'actor,command,epoch,family,version' || value['version'] !== 1 || value['epoch'] !== epoch || value['actor'] !== actor) return { locked: true, pending: null };
      const family = NotificationCommandFamily.fromWire(value['family']), command = value['command'] as Record<string, unknown> | null;
      if (!command || NotificationId.fromWire(command['commandId']) === NotificationId.Unknown || NotificationRevision.fromWire(command['expectedRevision']) === NotificationRevision.Unknown) return { locked: true, pending: null };
      const commandId = command['commandId'] as string, expectedRevision = NotificationRevision.fromWire(command['expectedRevision']);
      if (family === NotificationCommandFamily.Lifecycle) {
        if (Object.keys(command).sort().join(',') !== 'alertId,commandId,expectedRevision,operation,reason') return { locked: true, pending: null };
        const operation = NotificationStep.fromWire(command['operation']), reason = NotificationReason.fromWire(command['reason']), alertId = NotificationId.fromWire(command['alertId']);
        if (operation === NotificationStep.Unknown || reason === NotificationReason.Unknown || alertId === NotificationId.Unknown) return { locked: true, pending: null };
        return { locked: true, pending: { family, lifecycle: { commandId, expectedRevision, operation, reason, alertId: alertId.wire }, email: null } };
      }
      if (family === NotificationCommandFamily.Email) {
        if (Object.keys(command).sort().join(',') !== 'categories,commandId,expectedRevision,operation,severities') return { locked: true, pending: null };
        const operation = EmailOperation.fromWire(command['operation']);
        if (!Array.isArray(command['categories']) || !Array.isArray(command['severities'])) return { locked: true, pending: null };
        const categories = command['categories'].map(NotificationCategory.fromWire.bind(NotificationCategory)), severities = command['severities'].map(NotificationSeverity.fromWire.bind(NotificationSeverity));
        if (operation === EmailOperation.Unknown || categories.some(x => !NotificationCategory.email.includes(x)) || severities.some(x => !NotificationSeverity.email.includes(x)) || new Set(categories).size !== categories.length || new Set(severities).size !== severities.length || (operation === EmailOperation.Enable ? !categories.length || !severities.length : categories.length > 0 || severities.length > 0)) return { locked: true, pending: null };
        return { locked: true, pending: { family, lifecycle: null, email: { commandId, expectedRevision, operation, categories, severities } } };
      }
      return { locked: true, pending: null };
    } catch { return { locked: true, pending: null }; }
  }
  begin(epoch: string, actor: string, pending: NotificationPending): boolean {
    if (this.recover(epoch, actor).locked) return false;
    const command = pending.lifecycle ? { ...pending.lifecycle, operation: pending.lifecycle.operation.wire, expectedRevision: pending.lifecycle.expectedRevision.wire, reason: pending.lifecycle.reason.wire } : pending.email ? { ...pending.email, operation: pending.email.operation.wire, expectedRevision: pending.email.expectedRevision.wire, categories: pending.email.categories.map(x => x.wire), severities: pending.email.severities.map(x => x.wire) } : null;
    if (!command) return false;
    try { sessionStorage.setItem(this.key, JSON.stringify({ version: 1, epoch, actor, family: pending.family.wire, command })); return this.recover(epoch, actor).pending !== null; } catch { return false; }
  }
  release(epoch: string, actor: string, commandId: string): void {
    const pending = this.recover(epoch, actor).pending;
    if ((pending?.lifecycle?.commandId ?? pending?.email?.commandId) !== commandId) return;
    try { sessionStorage.removeItem(this.key); } catch { /* Retain conservative fence. */ }
  }
}
