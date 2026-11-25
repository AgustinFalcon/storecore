import type { Observable } from 'rxjs';
import { CalendarAudience, CalendarLifecycle, CalendarOperation, CalendarOutcome, CalendarPreflightIssue, CalendarReminderChannel, CalendarReminderReadiness, CalendarSwitchState } from './calendar-types';
export * from './calendar-types';
export interface CalendarTimeInput { readonly localDateTime: string; readonly timeZone: string; readonly offset: string; }
export interface CalendarTime extends CalendarTimeInput { readonly instant: string; }
export interface CalendarReminderRule { readonly id: string; readonly channel: CalendarReminderChannel; readonly offsetSeconds: number; }
export interface CalendarDefinitionInput { readonly definitionRevision: string; readonly title: string; readonly description: string; readonly start: CalendarTimeInput; readonly end: CalendarTimeInput; readonly audience: CalendarAudience; readonly campaignReference: string | null; readonly reminders: readonly CalendarReminderRule[]; }
export interface CalendarDefinition extends CalendarDefinitionInput { readonly hash: string; readonly start: CalendarTime; readonly end: CalendarTime; }
export interface CalendarEvent { readonly id: string; readonly revision: string; readonly lifecycle: CalendarLifecycle; readonly approvedDefinitionRevision: string | null; readonly createdAt: string; readonly definition: CalendarDefinition; }
export interface CalendarQuery { readonly from: string; readonly to: string; readonly lifecycle?: CalendarLifecycle; readonly audience?: CalendarAudience; readonly page: number; readonly size: number; }
export interface CalendarPage<T = CalendarEvent> { readonly items: readonly T[]; readonly total: number; readonly page: number; readonly size: number; readonly hasMore: boolean; }
export interface CalendarReceipt { readonly commandId: string; readonly eventId: string; readonly actorId: string | null; readonly operation: CalendarOperation; readonly expectedRevision: string | null; readonly reason: string | null; readonly outcome: CalendarOutcome; readonly before: CalendarEvent | null; readonly after: CalendarEvent; readonly recordedAt: string; }
export interface CalendarPreflight { readonly id: string; readonly eventId: string; readonly revision: string; readonly definitionRevision: string; readonly definitionHash: string; readonly issues: readonly CalendarPreflightIssue[]; readonly checkedAt: string; readonly expiresAt: string; }
export interface CalendarPreflightResult { readonly outcome: CalendarOutcome; readonly preflight: CalendarPreflight | null; readonly event: CalendarEvent; }
export interface CalendarReminderSwitch { readonly state: CalendarSwitchState; readonly revision: string; readonly readiness: CalendarReminderReadiness; }
export interface CalendarChange { readonly operation: CalendarOperation; readonly expectedRevision: string; readonly reason: string; readonly definition?: CalendarDefinitionInput; readonly preflightId?: string; }
export abstract class CalendarRepository {
  abstract list(query: CalendarQuery): Observable<CalendarPage>;
  abstract detail(eventId: string): Observable<CalendarEvent>;
  abstract create(commandId: string, definition: CalendarDefinitionInput): Observable<CalendarReceipt>;
  abstract preflight(eventId: string, commandId: string, expectedRevision: string): Observable<CalendarPreflightResult>;
  abstract change(eventId: string, commandId: string, change: CalendarChange): Observable<CalendarReceipt>;
  abstract createReceipt(commandId: string): Observable<CalendarReceipt>;
  abstract receipt(eventId: string, commandId: string): Observable<CalendarReceipt>;
  abstract audit(eventId: string, page: number, size: number): Observable<CalendarPage<CalendarReceipt>>;
  abstract reminderSwitch(): Observable<CalendarReminderSwitch>;
}
/** Decimal tokens deliberately never pass through JavaScript number. */
export class CalendarRevision {
  private constructor(readonly wire: string) {}
  static readonly Zero = new CalendarRevision('0');
  static fromWire(raw: unknown): CalendarRevision | null { return typeof raw === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(raw) && BigInt(raw) <= 9223372036854775807n ? new CalendarRevision(raw) : null; }
  next(): CalendarRevision | null { return this.wire === '9223372036854775807' ? null : CalendarRevision.fromWire((BigInt(this.wire) + 1n).toString()); }
}
export class CalendarUuid {
  private constructor(readonly wire: string) {}
  static fromWire(raw: unknown): CalendarUuid | null { return typeof raw === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw) && raw !== '00000000-0000-0000-0000-000000000000' ? new CalendarUuid(raw) : null; }
}
export function canApproveCalendarPreflight(event: CalendarEvent, preflight: CalendarPreflight, now: number): boolean {
  return event.lifecycle === CalendarLifecycle.Draft && preflight.eventId === event.id && preflight.revision === event.revision && preflight.definitionRevision === event.definition.definitionRevision && preflight.definitionHash === event.definition.hash && preflight.issues.length === 0 && now >= Date.parse(preflight.checkedAt) && now < Date.parse(preflight.expiresAt) && Date.parse(event.definition.start.instant) >= now + 300000 && Date.parse(event.definition.start.instant) <= now + 366 * 86400000;
}

export class CalendarUseCases {
  constructor(private readonly repository: CalendarRepository) {}
  list(query: CalendarQuery) { return this.repository.list(query); }
  detail(eventId: string) { return this.repository.detail(eventId); }
  create(commandId: string, definition: CalendarDefinitionInput) { return this.repository.create(commandId, definition); }
  preflight(eventId: string, commandId: string, expectedRevision: string) { return this.repository.preflight(eventId, commandId, expectedRevision); }
  change(eventId: string, commandId: string, change: CalendarChange) { return this.repository.change(eventId, commandId, change); }
  createReceipt(commandId: string) { return this.repository.createReceipt(commandId); }
  receipt(eventId: string, commandId: string) { return this.repository.receipt(eventId, commandId); }
  audit(eventId: string, page: number, size: number) { return this.repository.audit(eventId, page, size); }
  reminderSwitch() { return this.repository.reminderSwitch(); }
}
