import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationFixtureSeedStep } from './psd-notification-fixture.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const deliveryId = '22222222-2222-4222-8222-222222222222';
function fixture({ persisted = { id, sourceId: '17' }, detailId = id } = {}) {
  const calls = [], ids = [id, deliveryId];
  const query = sql => { calls.push(sql); return JSON.stringify(persisted); };
  const admin = { request: async path => {
    calls.push(path);
    return path.endsWith(id) ? { notification: { id: detailId, sourceId: '17', lifecycle: 'OPEN', revision: '0' }, availableOperations: ['ACKNOWLEDGE', 'RESOLVE'] }
      : { items: [{ notification: { id } }] };
  } };
  return { step: new NotificationFixtureSeedStep(query, admin, () => ids.shift()), calls };
}

test('real route notification receipt comes from constrained persisted stock evidence and real API reads', async () => {
  const { step, calls } = fixture();
  assert.deepEqual(await step.run(), { id, sourceId: '17' });
  assert.match(calls[0], /b.available_quantity=0 AND b.reserved_quantity=0/);
  assert.match(calls[0], /INSERT INTO notification_alerts/);
  assert.match(calls[0], /INSERT INTO notification_source_events/);
  assert.match(calls[0], /notification_v1_hash\('notification-event-v1'/);
  assert.deepEqual(calls.slice(1), [`/api/v1/user/notifications/${id}`, '/api/v1/user/notifications']);
});

test('a missing stock row, mismatched persisted identity or wrong API detail cannot create a receipt', async () => {
  for (const options of [{ persisted: { id: deliveryId, sourceId: '17' } }, { persisted: { id, sourceId: '' } }, { detailId: deliveryId }]) {
    await assert.rejects(fixture(options).step.run());
  }
  await assert.rejects(new NotificationFixtureSeedStep(() => '', { request: () => assert.fail('Must not read HTTP without a seed') }, (() => { const ids = [id, deliveryId]; return () => ids.shift(); })()).run());
});
