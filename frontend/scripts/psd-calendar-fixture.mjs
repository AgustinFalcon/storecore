import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = '/api/v1/user/commercial-calendar';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const title = 'PSD calendario comercial';
export const calendarFixtureListPath = `${base}/events?from=2026-11-01T03%3A00%3A00Z&to=2026-12-01T03%3A00%3A00Z&page=0&size=25`;

/** Seed through the real command boundary; publish evidence only after independent persisted reads. */
export class CalendarFixtureSeedStep {
  constructor(admin, createId = randomUUID) { this.admin = admin; this.createId = createId; }
  async run() {
    const commandId = this.createId();
    assert.match(commandId, uuid);
    assert.notEqual(commandId, '00000000-0000-0000-0000-000000000000');
    const definition = {
      definitionRevision: '0', title, description: 'Borrador persistido para la matriz de rutas PSD.',
      start: { localDateTime: '2026-11-26T10:00:00', timeZone: 'America/Argentina/Buenos_Aires', offset: '-03:00' },
      end: { localDateTime: '2026-11-26T11:00:00', timeZone: 'America/Argentina/Buenos_Aires', offset: '-03:00' },
      audience: 'INTERNAL_ALL', campaignReference: null, reminders: [],
    };
    const receipt = await this.admin.request(`${base}/events`, {
      method: 'POST', csrf: true, expected: [201], headers: { 'Idempotency-Key': commandId }, body: { definition },
    });
    assert.equal(receipt.commandId, commandId);
    assert.equal(receipt.operation, 'CREATE');
    assert.equal(receipt.outcome, 'APPLIED');
    assert.match(receipt.eventId, uuid);
    assert.notEqual(receipt.eventId, '00000000-0000-0000-0000-000000000000');
    const detail = await this.admin.request(`${base}/events/${receipt.eventId}`);
    assert.equal(detail.id, receipt.eventId);
    assert.equal(detail.lifecycle, 'DRAFT');
    assert.equal(detail.revision, '0');
    assert.equal(detail.definition.definitionRevision, '0');
    assert.equal(detail.definition.title, title);
    assert.deepEqual(detail, receipt.after);
    const page = await this.admin.request(calendarFixtureListPath);
    assert.equal(page.page, 0);
    assert.equal(page.size, 25);
    assert.equal(page.items.some(event => event.id === detail.id && event.lifecycle === 'DRAFT' && event.definition.title === title), true);
    return Object.freeze({ eventId: detail.id, title: detail.definition.title });
  }
}
