import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Disposable PostgreSQL fixture only: seed an explicit stock episode, then read it through the real API. */
export class NotificationFixtureSeedStep {
  constructor(query, admin, createId = randomUUID) {
    this.query = query; this.admin = admin; this.createId = createId;
  }
  async run() {
    const id = this.createId(), deliveryId = this.createId();
    for (const value of [id, deliveryId]) assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(id, deliveryId);
    const persisted = JSON.parse(this.query(`
      WITH stock AS (
        SELECT v.id FROM product_variants v JOIN inventory_balances b ON b.variant_id=v.id
        WHERE b.available_quantity=0 AND b.reserved_quantity=0 ORDER BY v.id LIMIT 1
      ), seeded AS (
        INSERT INTO notification_alerts(id,source_type,source_id,fingerprint,category,severity,lifecycle,revision,created_at)
        SELECT '${id}','STORECORE_FACT',id::text,
          notification_v1_hash('notification-v1','STOCK','OUT_OF_STOCK','psd-stock-episode-v1'),
          'STOCK','WARNING','OPEN',0,'2026-11-24T12:00:00Z' FROM stock RETURNING *
      ), evidence AS (
        INSERT INTO notification_source_events(delivery_id,alert_id,source_type,source_id,fingerprint,category,severity,condition_code,episode_key,event_hash,recorded_at)
        SELECT '${deliveryId}',id,source_type,source_id,fingerprint,category,severity,'OUT_OF_STOCK','psd-stock-episode-v1',
          notification_v1_hash('notification-event-v1',source_type,source_id,category,severity,'OUT_OF_STOCK','psd-stock-episode-v1'),created_at
        FROM seeded RETURNING alert_id,source_id
      ) SELECT json_build_object('id',alert_id::text,'sourceId',source_id)::text FROM evidence;
    `));
    assert.equal(persisted.id, id);
    assert.match(persisted.sourceId, /^[1-9][0-9]*$/);
    const detail = await this.admin.request(`/api/v1/user/notifications/${persisted.id}`);
    assert.equal(detail.notification.id, persisted.id);
    assert.equal(detail.notification.sourceId, persisted.sourceId);
    assert.equal(detail.notification.lifecycle, 'OPEN');
    assert.equal(detail.notification.revision, '0');
    assert.deepEqual(detail.availableOperations, ['ACKNOWLEDGE', 'RESOLVE']);
    const inbox = await this.admin.request('/api/v1/user/notifications');
    assert.equal(inbox.items.some(row => row.notification.id === persisted.id), true);
    return Object.freeze(persisted);
  }
}
