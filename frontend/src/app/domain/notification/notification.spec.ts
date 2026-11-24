import { NotificationActorId, NotificationId, NotificationQuery, NotificationReason, NotificationRevision } from './notification';
import { EmailOperation, EmailPreferenceState, EmailReadiness, NotificationCategory, NotificationLifecycle, NotificationOutcome, NotificationSeverity, NotificationSource, NotificationStep } from './notification-types';
describe('notification closed domain', () => {
  it('fails closed for unknown wire vocabularies and owns all transition preconditions', () => {
    for (const type of [NotificationSeverity, NotificationCategory, NotificationLifecycle, NotificationSource, NotificationStep, EmailOperation, EmailReadiness, EmailPreferenceState, NotificationOutcome]) {
      for (const raw of ['FUTURE', '', null, {}, 1]) expect(type.fromWire(raw)).toBe(type.Unknown);
    }
    expect(NotificationStep.Acknowledge.accepts(NotificationLifecycle.Open)).toBe(true);
    expect(NotificationStep.Resolve.accepts(NotificationLifecycle.Acknowledged)).toBe(true);
    expect(NotificationStep.Reopen.accepts(NotificationLifecycle.Resolved)).toBe(true);
    expect(NotificationStep.Resolve.accepts(NotificationLifecycle.Resolved)).toBe(false);
    for (const step of NotificationStep.all) expect(step.accepts(NotificationLifecycle.Unknown)).toBe(false);
  });
  it('keeps revisions exact above JS safe integer and rejects noncanonical or exhausted bounds', () => {
    expect(NotificationRevision.fromWire('9007199254740993').wire).toBe('9007199254740993');
    expect(NotificationRevision.fromWire('9223372036854775807').wire).toBe('9223372036854775807');
    for (const raw of ['01', '-1', '9223372036854775808', 0, null]) expect(NotificationRevision.fromWire(raw)).toBe(NotificationRevision.Unknown);
  });
  it('keeps the backend Long actor identity exact and rejects UUID-shaped actors', () => {
    expect(NotificationActorId.fromWire('42').wire).toBe('42');
    expect(NotificationActorId.fromWire(42).wire).toBe('42');
    expect(NotificationActorId.fromWire('9223372036854775807').wire).toBe('9223372036854775807');
    for (const raw of ['0', '01', '-1', '9223372036854775808', '22222222-2222-4222-8222-222222222222', null]) {
      expect(NotificationActorId.fromWire(raw)).toBe(NotificationActorId.Unknown);
    }
  });
  it('uses ASCII edge trim and Unicode code point bounds for reasons', () => {
    expect(NotificationReason.fromWire(' \n bien\t').wire).toBe('bien');
    expect(NotificationReason.fromWire('😀'.repeat(500))).not.toBe(NotificationReason.Unknown);
    expect(NotificationReason.fromWire('😀'.repeat(501))).toBe(NotificationReason.Unknown);
    expect(NotificationReason.fromWire('\u00a0').wire).toBe('\u00a0');
    for (const raw of ['', '  ', 'a\0b', '\ud800']) expect(NotificationReason.fromWire(raw)).toBe(NotificationReason.Unknown);
  });
  it('validates all URL filters instead of treating unknowns as absent', () => {
    const query = NotificationQuery.fromWire({ page: '2', size: '25', severity: NotificationSeverity.Critical.wire, category: NotificationCategory.Stock.wire });
    expect(query.valid).toBe(true); expect(query.toWire()).toEqual({ page: '2', size: '25', severity: 'CRITICAL', category: 'STOCK' });
    for (const raw of [{ severity: 'FUTURE' }, { category: '' }, { page: '-1' }, { size: '101' }, { size: '0' }, { page: '01' }, { source: ['STORECORE_FACT'] }, { surprise: 'x' }]) expect(NotificationQuery.fromWire(raw).valid).toBe(false);
    expect(NotificationId.fromWire('00000000-0000-0000-0000-000000000000')).toBe(NotificationId.Unknown);
  });
});
