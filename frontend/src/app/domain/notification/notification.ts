import { Observable } from 'rxjs';
import { EmailOperation, EmailPreferenceState, EmailReadiness, NotificationCategory, NotificationLifecycle, NotificationOutcome, NotificationSeverity, NotificationSource, NotificationStep } from './notification-types';

export class NotificationRevision {
  private constructor(readonly wire: string) {}
  static readonly Unknown = new NotificationRevision('');
  static fromWire(raw: unknown): NotificationRevision { return typeof raw === 'string' && raw.length <= 19 && /^(0|[1-9][0-9]*)$/.test(raw) && BigInt(raw) <= 9223372036854775807n ? new NotificationRevision(raw) : this.Unknown; }
}
export class NotificationId {
  private constructor(readonly wire: string) {}
  static readonly Unknown = new NotificationId('');
  static fromWire(raw: unknown): NotificationId { return typeof raw === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw) && raw !== '00000000-0000-0000-0000-000000000000' ? new NotificationId(raw) : this.Unknown; }
}
export class NotificationActorId {
  private constructor(readonly wire: string) {}
  static readonly Unknown = new NotificationActorId('');
  static fromWire(raw: unknown): NotificationActorId {
    const value = typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : raw;
    return typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && BigInt(value) <= 9223372036854775807n
      ? new NotificationActorId(value)
      : this.Unknown;
  }
}
export class NotificationReason {
  private constructor(readonly wire: string) {}
  static readonly Unknown = new NotificationReason('');
  static fromWire(raw: unknown): NotificationReason {
    if (typeof raw !== 'string') return this.Unknown;
    const value = raw.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, '');
    return value.includes('\0') || [...value].length < 1 || [...value].length > 500 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value) ? this.Unknown : new NotificationReason(value);
  }
}
export interface NotificationAlert {
  readonly id: NotificationId; readonly source: NotificationSource; readonly sourceId: string; readonly fingerprint: string;
  readonly category: NotificationCategory; readonly severity: NotificationSeverity; readonly lifecycle: NotificationLifecycle;
  readonly revision: NotificationRevision; readonly createdAt: string; readonly operations: readonly NotificationStep[];
}
export interface NotificationPage { readonly items: readonly NotificationAlert[]; readonly total: number; readonly page: number; readonly size: number; readonly hasMore: boolean; }
export interface NotificationPreference {
  readonly state: EmailPreferenceState; readonly revision: NotificationRevision; readonly categories: readonly NotificationCategory[];
  readonly severities: readonly NotificationSeverity[]; readonly boundEmailVersion: string | null;
}
export interface NotificationPreferenceView { readonly preference: NotificationPreference; readonly verified: boolean; readonly readiness: EmailReadiness; }
export interface NotificationReceipt { readonly commandId: string; readonly alertId: string; readonly actorId: NotificationActorId; readonly operation: NotificationStep; readonly expectedRevision: NotificationRevision; readonly reason: string; readonly occurredAt: string; readonly outcome: NotificationOutcome; readonly before: NotificationAlert; readonly after: NotificationAlert | null; readonly currentRevision: NotificationRevision; }
export interface EmailPreferenceReceipt { readonly commandId: string; readonly outcome: NotificationOutcome; readonly preference: NotificationPreference; readonly recordedAt: string; }
export interface LifecycleCommand { readonly commandId: string; readonly alertId: string; readonly operation: NotificationStep; readonly expectedRevision: NotificationRevision; readonly reason: NotificationReason; }
export interface NotificationTransitionIntent { readonly alertId: NotificationId; readonly expectedRevision: NotificationRevision; readonly step: NotificationStep; readonly reason: string; }
export interface EmailPreferenceCommand { readonly commandId: string; readonly operation: EmailOperation; readonly expectedRevision: NotificationRevision; readonly categories: readonly NotificationCategory[]; readonly severities: readonly NotificationSeverity[]; }
export class NotificationQuery {
  private constructor(readonly page: number, readonly size: number, readonly severity: NotificationSeverity | null, readonly category: NotificationCategory | null, readonly lifecycle: NotificationLifecycle | null, readonly source: NotificationSource | null, readonly valid: boolean) {}
  static readonly Unknown = new NotificationQuery(0, 25, null, null, null, null, false);
  static fromWire(raw: Record<string, unknown>): NotificationQuery {
    if (Object.keys(raw).some(key => !['page', 'size', 'severity', 'category', 'lifecycle', 'source'].includes(key))) return this.Unknown;
    const integer = (value: unknown, fallback: number): number => value === undefined ? fallback : typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : NaN;
    const page = integer(raw['page'], 0), size = integer(raw['size'], 25);
    const severity = raw['severity'] === undefined ? null : NotificationSeverity.fromWire(raw['severity']);
    const category = raw['category'] === undefined ? null : NotificationCategory.fromWire(raw['category']);
    const lifecycle = raw['lifecycle'] === undefined ? null : NotificationLifecycle.fromWire(raw['lifecycle']);
    const source = raw['source'] === undefined ? null : NotificationSource.fromWire(raw['source']);
    if (!Number.isSafeInteger(page) || page > 2147483647 || !Number.isInteger(size) || size < 1 || size > 100 || severity === NotificationSeverity.Unknown || category === NotificationCategory.Unknown || lifecycle === NotificationLifecycle.Unknown || source === NotificationSource.Unknown) return this.Unknown;
    return new NotificationQuery(page, size, severity, category, lifecycle, source, true);
  }
  toWire(): Record<string, string> { return { page: String(this.page), size: String(this.size), ...Object.fromEntries(['severity', 'category', 'lifecycle', 'source'].flatMap(key => { const value = this[key as 'severity' | 'category' | 'lifecycle' | 'source']; return value ? [[key, value.wire]] : []; })) }; }
}
export interface NotificationRepository {
  list(query: NotificationQuery): Observable<NotificationPage>;
  detail(id: string): Observable<NotificationAlert>;
  submit(command: LifecycleCommand): Observable<NotificationReceipt>;
  receipt(command: LifecycleCommand): Observable<NotificationReceipt>;
  preference(): Observable<NotificationPreferenceView>;
  savePreference(command: EmailPreferenceCommand): Observable<EmailPreferenceReceipt>;
}
export class NotificationUseCases {
  constructor(private readonly repository: NotificationRepository) {}
  list(query: NotificationQuery): Observable<NotificationPage> { if (!query.valid) throw new Error('Filtros inválidos'); return this.repository.list(query); }
  detail(id: NotificationId): Observable<NotificationAlert> { if (id === NotificationId.Unknown) throw new Error('Identificador inválido'); return this.repository.detail(id.wire); }
  submit(command: LifecycleCommand): Observable<NotificationReceipt> {
    if (NotificationId.fromWire(command.commandId) === NotificationId.Unknown || NotificationId.fromWire(command.alertId) === NotificationId.Unknown || command.operation === NotificationStep.Unknown || command.expectedRevision === NotificationRevision.Unknown || command.reason === NotificationReason.Unknown) throw new Error('Comando inválido');
    return this.repository.submit(command);
  }
  recover(command: LifecycleCommand): Observable<NotificationReceipt> { return this.repository.receipt(command); }
  preference(): Observable<NotificationPreferenceView> { return this.repository.preference(); }
  savePreference(command: EmailPreferenceCommand): Observable<EmailPreferenceReceipt> {
    const enabling = command.operation === EmailOperation.Enable;
    if (NotificationId.fromWire(command.commandId) === NotificationId.Unknown || command.expectedRevision === NotificationRevision.Unknown || command.operation === EmailOperation.Unknown || (enabling && (!command.categories.length || !command.severities.length || command.categories.some(x => !NotificationCategory.email.includes(x)) || command.severities.some(x => !NotificationSeverity.email.includes(x)) || new Set(command.categories).size !== command.categories.length || new Set(command.severities).size !== command.severities.length)) || (!enabling && (command.categories.length > 0 || command.severities.length > 0))) throw new Error('Preferencia inválida');
    return this.repository.savePreference(command);
  }
}
