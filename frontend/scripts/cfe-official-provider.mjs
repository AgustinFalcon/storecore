import http from 'node:http';
import { randomUUID } from 'node:crypto';

// External provider simulation only. Spring's official HTTP/signature adapters,
// scheduled worker and PostgreSQL remain real; this is never a StoreCore endpoint.
const orders = new Map();
const claims = new Map();
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4302');
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
  if (url.pathname === '/health') return send(200, { ready: true });
  if (request.headers.authorization !== 'Bearer cfe-local-provider-token') return send(401, {});
  if (request.method === 'POST' && url.pathname === '/v1/orders') {
    let body = ''; for await (const part of request) body += part;
    const input = JSON.parse(body);
    const claim = request.headers['x-idempotency-key'];
    if (claims.has(claim)) return send(200, orders.get(claims.get(claim)));
    const id = `cfe-${randomUUID()}`;
    const order = { id, external_reference: input.external_reference, user_id: 'cfe-user',
      integration_data: { application_id: 'cfe-app' }, total_amount: Number(input.total_amount),
      paid_amount: 0, currency: 'ARS', status: 'created', status_detail: 'pending',
      transactions: { payments: [] },
      type_config: { online: { checkout_url: `https://provider.example.test/checkout/${id}` } },
      checkout_url: `https://provider.example.test/checkout/${id}` };
    orders.set(id, order); claims.set(claim, id); return send(201, order);
  }
  const fixture = /^\/fixture\/orders\/([\w-]+)\/accredit$/.exec(url.pathname);
  if (request.method === 'POST' && fixture) {
    const order = orders.get(fixture[1]); if (!order) return send(404, {});
    Object.assign(order, { status: 'processed', status_detail: 'accredited', paid_amount: order.total_amount,
      transactions: { payments: [{ id: `${order.id}-payment`, status: 'processed', status_detail: 'accredited',
        amount: order.total_amount, payment_method: { type: 'account_money' } }] } });
    return send(200, order);
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
