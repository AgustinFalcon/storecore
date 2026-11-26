import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CalendarFixtureSeedStep, calendarFixtureListPath } from './psd-calendar-fixture.mjs';

const commandId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
function fixture(alter = (_path, value) => value) {
  const calls = [];
  const event = { id: eventId, lifecycle: 'DRAFT', revision: '0', definition: { definitionRevision: '0', title: 'PSD calendario comercial' } };
  const admin = { request: async (path, options) => {
    calls.push({ path, options });
    return alter(path, options ? { commandId, eventId, operation: 'CREATE', outcome: 'APPLIED', after: event }
      : path === calendarFixtureListPath ? { page: 0, size: 25, items: [event] } : event);
  } };
  return { step: new CalendarFixtureSeedStep(admin, () => commandId), calls };
}
test('calendar fixture writes one real draft then independently checks detail and bounded month list', async () => {
  const { step, calls } = fixture();
  assert.deepEqual(await step.run(), { eventId, title: 'PSD calendario comercial' });
  assert.deepEqual(calls.map(call => call.path), ['/api/v1/user/commercial-calendar/events', `/api/v1/user/commercial-calendar/events/${eventId}`, calendarFixtureListPath]);
  assert.equal(calls[0].options.csrf, true);
  assert.equal(calls[0].options.headers['Idempotency-Key'], commandId);
  assert.equal(calls[0].options.body.definition.start.timeZone, 'America/Argentina/Buenos_Aires');
  assert.equal(Object.hasOwn(calls[0].options.body, 'eventId'), false);
});
test('missing list evidence, invalid UUID, denied command and mismatched persisted snapshots cannot yield receipt', async () => {
  for (const alter of [
    (path, value) => path === calendarFixtureListPath ? { ...value, items: [] } : value,
    (_path, value) => value.eventId ? { ...value, eventId: 'not-an-id' } : value,
    (_path, value) => value.outcome ? { ...value, outcome: 'UNKNOWN' } : value,
    (path, value) => path.endsWith(eventId) ? { ...value, revision: '1' } : value,
  ]) await assert.rejects(fixture(alter).step.run());
});
