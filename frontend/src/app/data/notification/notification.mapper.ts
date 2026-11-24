import { EmailPreferenceReceipt, NotificationActorId, NotificationAlert, NotificationId, NotificationPage, NotificationPreference, NotificationPreferenceView, NotificationReceipt, NotificationRevision } from '../../domain/notification/notification';
import { EmailPreferenceState, EmailReadiness, NotificationCategory, NotificationLifecycle, NotificationOutcome, NotificationSeverity, NotificationSource, NotificationStep } from '../../domain/notification/notification-types';

const object = (raw: unknown): Record<string, unknown> => { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Respuesta de notificaciones inválida'); return raw as Record<string, unknown>; };
const string = (raw: unknown): string => { if (typeof raw !== 'string' || raw.includes('\0')) throw new Error('Texto inválido'); return raw; };
const array = (raw: unknown): unknown[] => { if (!Array.isArray(raw)) throw new Error('Lista inválida'); return raw; };
const timestamp = (raw: unknown): string => { const value = string(raw); if (!Number.isFinite(Date.parse(value))) throw new Error('Fecha inválida'); return value; };
const revision = (raw: unknown): NotificationRevision => { const result = NotificationRevision.fromWire(raw); if (result === NotificationRevision.Unknown) throw new Error('Revisión inválida'); return result; };
const id = (raw: unknown): NotificationId => { const result = NotificationId.fromWire(raw); if (result === NotificationId.Unknown) throw new Error('Identificador inválido'); return result; };
const actorId = (raw: unknown): NotificationActorId => { const result = NotificationActorId.fromWire(raw); if (result === NotificationActorId.Unknown) throw new Error('Actor inválido'); return result; };
function snapshot(raw: unknown, createdAt = '', operations: unknown[] = []): NotificationAlert {
  const value = object(raw), fingerprint = string(value['fingerprint']), sourceId = string(value['sourceId']);
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || !sourceId.length || new TextEncoder().encode(sourceId).length > 128) throw new Error('Origen inválido');
  const lifecycle = NotificationLifecycle.fromWire(value['lifecycle']);
  const severity = NotificationSeverity.fromWire(value['severity']), category = NotificationCategory.fromWire(value['category']), source = NotificationSource.fromWire(value['sourceType']);
  const known = lifecycle !== NotificationLifecycle.Unknown && severity !== NotificationSeverity.Unknown && category !== NotificationCategory.Unknown && source !== NotificationSource.Unknown;
  return Object.freeze({ id: id(value['id']), sourceId, fingerprint, source, category, severity, lifecycle, revision: revision(value['revision']), createdAt,
    operations: known ? operations.map(NotificationStep.fromWire.bind(NotificationStep)).filter(step => step !== NotificationStep.Unknown && step.accepts(lifecycle)) : [] });
}
export function mapNotificationAlert(raw: unknown): NotificationAlert { const value = object(raw); return snapshot(value['notification'], timestamp(value['createdAt']), array(value['availableOperations'])); }
export function mapNotificationPage(raw: unknown): NotificationPage {
  const value = object(raw), items = array(value['items']).map(mapNotificationAlert), total = value['total'], page = value['page'], size = value['size'];
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || typeof page !== 'number' || !Number.isSafeInteger(page) || page < 0 || page > 2147483647 || typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 100 || items.length > size || typeof value['hasMore'] !== 'boolean' || value['hasMore'] !== (page * size + items.length < total)) throw new Error('Página inválida');
  return { items, total, page, size, hasMore: value['hasMore'] };
}
function preference(raw: unknown): NotificationPreference {
  const value = object(raw);
  const categories = array(value['categories']).map(NotificationCategory.fromWire.bind(NotificationCategory));
  const severities = array(value['severities']).map(NotificationSeverity.fromWire.bind(NotificationSeverity));
  const state = EmailPreferenceState.fromWire(value['state']);
  const binding = value['boundEmailVersion'];
  if (binding !== null && (typeof binding !== 'string' || !/^[1-9][0-9]*$/.test(binding))) throw new Error('Identidad de correo inválida');
  if (categories.some(x => !NotificationCategory.email.includes(x)) || severities.some(x => !NotificationSeverity.email.includes(x)) || new Set(categories).size !== categories.length || new Set(severities).size !== severities.length) throw new Error('Filtros de correo inválidos');
  if (state === EmailPreferenceState.Enabled ? !categories.length || !severities.length || binding === null : categories.length > 0 || severities.length > 0 || binding !== null) throw new Error('Preferencia inconsistente');
  return { state, revision: revision(value['revision']), categories, severities, boundEmailVersion: binding as string | null };
}
export function mapNotificationPreference(raw: unknown): NotificationPreferenceView { const value = object(raw); if (typeof value['verified'] !== 'boolean') throw new Error('Verificación inválida'); return { preference: preference(value['preference']), verified: value['verified'], readiness: EmailReadiness.fromWire(value['readiness']) }; }
export function mapNotificationReceipt(raw: unknown): NotificationReceipt {
  const value = object(raw), operation = NotificationStep.fromWire(value['operation']), outcome = NotificationOutcome.fromWire(value['outcome']);
  if (operation === NotificationStep.Unknown || outcome === NotificationOutcome.Unknown || outcome === NotificationOutcome.EmailUnverified) throw new Error('Recibo inválido');
  const before = snapshot(value['before']), after = value['after'] === null ? null : snapshot(value['after']);
  if ((outcome === NotificationOutcome.Applied) !== (after !== null)) throw new Error('Recibo inconsistente');
  const alertId = id(value['alertId']).wire, expectedRevision = revision(value['expectedRevision']), currentRevision = revision(value['currentRevision']);
  if (before.id.wire !== alertId || currentRevision.wire !== (after ?? before).revision.wire) throw new Error('Recibo inconsistente');
  if (after && (after.id.wire !== alertId || before.source !== after.source || before.sourceId !== after.sourceId || before.fingerprint !== after.fingerprint || before.category !== after.category || before.severity !== after.severity || !operation.accepts(before.lifecycle) || after.lifecycle !== operation.destination || before.revision.wire !== expectedRevision.wire || BigInt(after.revision.wire) !== BigInt(before.revision.wire) + 1n)) throw new Error('Transición de recibo inválida');
  return { commandId: id(value['commandId']).wire, alertId, actorId: actorId(value['actorId']), operation, expectedRevision, reason: string(value['reason']), occurredAt: timestamp(value['occurredAt']), outcome, before, after, currentRevision };
}
export function mapEmailPreferenceReceipt(raw: unknown): EmailPreferenceReceipt { const value = object(raw), outcome = NotificationOutcome.fromWire(value['outcome']); if (outcome === NotificationOutcome.Unknown || outcome === NotificationOutcome.InvalidTransition) throw new Error('Recibo inválido'); return { commandId: id(value['commandId']).wire, outcome, preference: preference(value['preference']), recordedAt: timestamp(value['recordedAt']) }; }
