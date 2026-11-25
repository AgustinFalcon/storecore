import { Injectable } from '@angular/core';
import { CalendarChange, CalendarDefinitionInput, CalendarRecoveryState, CalendarRevision, CalendarUuid } from '../../domain/commercial-calendar/calendar';
import { CalendarMapper } from '../../data/commercial-calendar/calendar.mapper';

export class CalendarIntentKind {
  private constructor(readonly wire: string) {}
  static readonly Create = new CalendarIntentKind('CREATE');
  static readonly Change = new CalendarIntentKind('CHANGE');
  static readonly Preflight = new CalendarIntentKind('PREFLIGHT');
  static readonly Unknown = new CalendarIntentKind('UNKNOWN');
  static fromWire(raw: unknown): CalendarIntentKind { return [this.Create, this.Change, this.Preflight].find(value => value.wire === raw) ?? this.Unknown; }
}
export interface CalendarPending { readonly commandId: string; readonly kind: CalendarIntentKind; readonly eventId: string | null; readonly definition: CalendarDefinitionInput | null; readonly change: CalendarChange | null; readonly expectedRevision: string | null; }
export interface CalendarRecovery { readonly status: CalendarRecoveryState; readonly pending: CalendarPending | null; }
@Injectable({ providedIn: 'root' })
export class CalendarCommandJournal {
  private readonly key = 'sc:calendar-command:v1';
  recover(epoch: string, actor: string): CalendarRecovery {
    const corrupt = { status: CalendarRecoveryState.Corrupt, pending: null };
    try {
      const text = sessionStorage.getItem(this.key); if (text === null) return { status: CalendarRecoveryState.Clear, pending: null };
      const raw = JSON.parse(text) as Record<string, unknown>;
      if (typeof raw?.['epoch'] === 'string' && typeof raw['actor'] === 'string' && (raw['epoch'] !== epoch || raw['actor'] !== actor)) { sessionStorage.removeItem(this.key); return { status: CalendarRecoveryState.Clear, pending: null }; }
      if (!raw || Object.keys(raw).sort().join(',') !== 'actor,command,epoch,version' || raw['version'] !== 1 || raw['epoch'] !== epoch || raw['actor'] !== actor) return corrupt;
      const command = raw['command'] as Record<string, unknown>;
      if (!command || Object.keys(command).sort().join(',') !== 'change,commandId,definition,eventId,expectedRevision,kind' || !CalendarUuid.fromWire(command['commandId'])) return corrupt;
      const kind = CalendarIntentKind.fromWire(command['kind']), eventId = command['eventId'], expectedRevision = command['expectedRevision'];
      const definition = command['definition'] === null ? null : CalendarMapper.definitionFromInputWire(command['definition']);
      const change = command['change'] === null ? null : CalendarMapper.changeFromInputWire(command['change']);
      if (kind === CalendarIntentKind.Unknown || kind === CalendarIntentKind.Create && (eventId !== null || expectedRevision !== null || !definition || definition.definitionRevision !== '0' || change !== null) || kind === CalendarIntentKind.Change && (!CalendarUuid.fromWire(eventId) || !change || definition !== null || expectedRevision !== change.expectedRevision) || kind === CalendarIntentKind.Preflight && (!CalendarUuid.fromWire(eventId) || !CalendarRevision.fromWire(expectedRevision) || definition !== null || change !== null)) return corrupt;
      return { status: CalendarRecoveryState.Pending, pending: { commandId: command['commandId'] as string, kind, eventId: eventId as string | null, expectedRevision: expectedRevision as string | null, definition, change } };
    } catch { return corrupt; }
  }
  begin(epoch: string, actor: string, pending: CalendarPending): boolean {
    if (this.recover(epoch, actor).status !== CalendarRecoveryState.Clear) return false;
    try { sessionStorage.setItem(this.key, JSON.stringify({ version:1, epoch, actor, command:{ ...pending, kind: pending.kind.wire, definition: pending.definition ? CalendarMapper.definitionInput(pending.definition) : null, change: pending.change ? CalendarMapper.changeInput(pending.change) : null } })); return this.recover(epoch, actor).status === CalendarRecoveryState.Pending; } catch { return false; }
  }
  release(epoch: string, actor: string, commandId: string): void {
    if (this.recover(epoch, actor).pending?.commandId !== commandId) return;
    try { sessionStorage.removeItem(this.key); } catch { /* Keep the mutation fence. */ }
  }
}
