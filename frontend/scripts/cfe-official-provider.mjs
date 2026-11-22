import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// External provider simulation only. Spring's official HTTP/signature adapters,
// scheduled worker and PostgreSQL remain real; this is never a StoreCore endpoint.
const statusToken = Symbol('ProviderOrderStatus');
class ProviderOrderStatus {
  static Created = new ProviderOrderStatus(statusToken, 'created', 'pending');
  static Processed = new ProviderOrderStatus(statusToken, 'processed', 'accredited');
  static Unknown = new ProviderOrderStatus(statusToken, 'unknown', 'unknown');
  constructor(token, wire, detail) {
    if (token !== statusToken) throw new TypeError('ProviderOrderStatus is closed');
    this.wire = wire; this.detail = detail; Object.freeze(this);
  }
  static fromWire(value) {
    return [this.Created, this.Processed].find(candidate => candidate.wire === value) ?? this.Unknown;
  }
}

const journalPath = process.env.CFE_PROVIDER_JOURNAL_PATH ? resolve(process.env.CFE_PROVIDER_JOURNAL_PATH) : null;
const orders = new Map();
const claims = new Map();
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function requestHash(input) { return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex'); }
function persist() {
  if (!journalPath) return;
  mkdirSync(dirname(journalPath), { recursive: true });
  const temporary = `${journalPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, orders: [...orders.values()], claims: [...claims.entries()] }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, journalPath);
}
function restore() {
  if (!journalPath || !existsSync(journalPath)) return;
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  if (journal?.schemaVersion !== 1 || !Array.isArray(journal.orders) || !Array.isArray(journal.claims)) throw new Error('Unsupported CFE provider journal');
  for (const order of journal.orders) {
    if (typeof order?.id !== 'string' || ProviderOrderStatus.fromWire(order.status) === ProviderOrderStatus.Unknown) throw new Error('Invalid CFE provider order journal entry');
    orders.set(order.id, order);
  }
  for (const [claim, value] of journal.claims) {
    if (typeof claim !== 'string' || typeof value?.orderId !== 'string' || typeof value?.requestHash !== 'string' || !orders.has(value.orderId)) throw new Error('Invalid CFE provider claim journal entry');
    claims.set(claim, value);
  }
}
restore();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4302');
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
  if (url.pathname === '/health') return send(200, { ready: true });
  if (request.headers.authorization !== 'Bearer cfe-local-provider-token') return send(401, {});
  if (request.method === 'POST' && url.pathname === '/v1/orders') {
    let body = ''; for await (const part of request) body += part;
    const input = JSON.parse(body);
    const claim = request.headers['x-idempotency-key'];
    if (typeof claim !== 'string' || claim.length === 0) return send(400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
    const hash = requestHash(input);
    if (claims.has(claim)) {
      const existing = claims.get(claim);
      if (existing.requestHash !== hash) return send(409, { error: 'IDEMPOTENCY_KEY_REUSED' });
      return send(200, orders.get(existing.orderId));
    }
    const id = `cfe-${randomUUID()}`;
    const order = { id, external_reference: input.external_reference, user_id: 'cfe-user',
      integration_data: { application_id: 'cfe-app' }, total_amount: Number(input.total_amount),
      paid_amount: 0, currency: 'ARS', status: ProviderOrderStatus.Created.wire, status_detail: ProviderOrderStatus.Created.detail,
      transactions: { payments: [] },
      type_config: { online: { checkout_url: `https://provider.example.test/checkout/${id}` } },
      checkout_url: `https://provider.example.test/checkout/${id}` };
    orders.set(id, order); claims.set(claim, { orderId: id, requestHash: hash }); persist(); return send(201, order);
  }
  const fixture = /^\/fixture\/orders\/([\w-]+)\/accredit$/.exec(url.pathname);
  if (request.method === 'POST' && fixture) {
    const order = orders.get(fixture[1]); if (!order) return send(404, {});
    Object.assign(order, { status: ProviderOrderStatus.Processed.wire, status_detail: ProviderOrderStatus.Processed.detail, paid_amount: order.total_amount,
      transactions: { payments: [{ id: `${order.id}-payment`, status: ProviderOrderStatus.Processed.wire, status_detail: ProviderOrderStatus.Processed.detail,
        amount: order.total_amount, payment_method: { type: 'account_money' } }] } });
    persist(); return send(200, order);
  }
  if (url.pathname === '/v1/orders/search') return send(200, {
    results: [...orders.values()].filter((order) => order.external_reference === url.searchParams.get('external_reference')),
    paging: { total_pages: 1 },
  });
  const resource = /^\/v1\/orders\/([\w-]+)$/.exec(url.pathname);
  if (request.method === 'GET' && resource) return send(orders.has(resource[1]) ? 200 : 404, orders.get(resource[1]) ?? {});
  send(404, {});
});
server.listen(4302, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
