/**
 * Local stand-in for /api/v1 while the installation backend is down.
 * Serves the payloads the existing HTTP mappers already read. Not an Angular component.
 */
import { createServer } from 'node:http';

const lamp = 'http://127.0.0.1:8080/media/lamp.svg';
const line = {
  sku: 'SKU-100',
  name: 'Lámpara de escritorio',
  quantity: 2,
  originalUnitPrice: 14900,
  discountAmount: 2400,
  offerRef: 'OF-21',
  campaignRef: 'BF-MANUAL',
  effectiveUnitPrice: 12500,
};
const products = [
  {
    sku: 'SKU-100',
    name: 'Lámpara de escritorio',
    description: 'Lámpara de mesa para esta instalación.',
    brand: 'Casa',
    category: 'Iluminación',
    images: [lamp],
    imageUrl: lamp,
    variants: [{ id: 'v-100', sku: 'SKU-100', name: 'Única', availableQuantity: 8 }],
    price: { base: 14900, desired: 12500, observed: 13000, effective: 12500, priceVersion: 'p-100' },
    offerRef: 'OF-21',
    validFrom: '2026-09-01T12:00:00Z',
    validUntil: '2026-12-01T12:00:00Z',
    active: true,
  },
  {
    sku: 'SKU-101',
    name: 'Portalámparas',
    description: 'Pieza suelta, sin promo.',
    brand: 'Casa',
    category: 'Iluminación',
    images: [lamp],
    imageUrl: lamp,
    variants: [{ id: 'v-101', sku: 'SKU-101', name: 'Única', availableQuantity: 3 }],
    price: { base: 3200, desired: null, observed: 3200, effective: 3200, priceVersion: 'p-101' },
    offerRef: null,
    active: true,
  },
];
const order = {
  id: 'ord-1042',
  orderStatus: 'PAID',
  paymentStatus: 'PENDING',
  shipmentStatus: 'PREPARING',
  tracking: null,
  total: 25000,
  paymentMethod: 'MERCADO_PAGO',
  lines: [line],
  rmaStatus: null,
};
let billing = {
  legalName: 'Ana Pérez',
  taxId: '20-12345678-9',
  taxCondition: 'CONSUMIDOR_FINAL',
  documentStatus: 'NOT_ISSUED',
};
let shippingSim = {
  optionId: 'STANDARD',
  status: 'CONFIRMED',
  latitude: -34.611,
  longitude: -58.377,
  originLatitude: -34.6037,
  originLongitude: -58.3816,
};

const packed = {
  ...order,
  id: 'ord-1041',
  orderStatus: 'PAID',
  paymentStatus: 'APPROVED',
  shipmentStatus: 'PENDING',
  total: 3200,
  lines: [{ ...line, sku: 'SKU-101', name: 'Portalámparas', quantity: 1, originalUnitPrice: 3200, discountAmount: 0, offerRef: null, campaignRef: null, effectiveUnitPrice: 3200 }],
};

function sampleOrder(id) {
  if (id === packed.id) return packed;
  if (id === order.id) return order;
  return null;
}

function has(req, name) {
  return String(req.headers.cookie || '').includes(name + '=1');
}

function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function send(res, status, body, extra = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': 'http://127.0.0.1:4201',
    'access-control-allow-credentials': 'true',
    'x-csrf-token': 'csrf-local',
    ...extra,
  };
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#ececef"/><rect x="250" y="120" width="140" height="180" rx="16" fill="#d4d4d8"/><rect x="300" y="300" width="40" height="160" fill="#a1a1aa"/><rect x="220" y="460" width="200" height="24" rx="8" fill="#71717a"/></svg>`;

function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1:8080');
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (req.method === 'OPTIONS') {
    send(res, 204, undefined);
    return;
  }
  if (path === '/media/lamp.svg') {
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    res.end(svg);
    return;
  }
  if (!path.startsWith('/api/v1')) {
    send(res, 404, { message: 'not found' });
    return;
  }
  const route = path.slice('/api/v1'.length) || '/';
  const customer = has(req, 'sc_customer');
  const user = has(req, 'sc_user');

  if (route === '/health') return send(res, 200, { status: 'UP' });
  if (route === '/catalog/brands') return send(res, 200, [{ id: 'casa', name: 'Casa' }]);
  if (route === '/catalog/categories') return send(res, 200, [{ id: 'luz', name: 'Iluminación' }]);
  if (route === '/content/home' || route === '/user/content/home') {
    return send(res, 200, {
      title: 'Iluminación de esta instalación',
      body: 'El banner sale de estos bloques.',
      blocks: [
        { id: 'b1', title: 'Mesa', body: 'Lámparas para el escritorio.' },
        { id: 'b2', title: 'Oferta del día', body: 'La lámpara de escritorio está en oferta.' },
      ],
    });
  }
  if (route === '/catalog') {
    const offers = url.searchParams.get('offers') === 'true';
    const q = (url.searchParams.get('query') || url.searchParams.get('q') || '').toLowerCase();
    let rows = products;
    if (offers) rows = rows.filter((item) => item.offerRef);
    if (q) rows = rows.filter((item) => item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q));
    return send(res, 200, rows);
  }
  if (route.startsWith('/catalog/products/')) {
    const sku = decodeURIComponent(route.split('/').pop() || '');
    const found = products.find((item) => item.sku === sku);
    return found ? send(res, 200, found) : send(res, 404, { message: 'no' });
  }
  if (route === '/customer/auth/login' || route === '/customer/auth/register') {
    return send(res, 200, { id: 'c-1', email: 'ana@example.test', firstName: 'Ana', lastName: 'Pérez' }, {
      'set-cookie': 'sc_customer=1; Path=/; SameSite=Lax',
    });
  }
  if (route === '/customer/auth/csrf') return send(res, 200, {});
  if (route === '/customer/me') {
    return customer
      ? send(res, 200, { email: 'ana@example.test', firstName: 'Ana', lastName: 'Pérez', phone: '11 5555 0101' })
      : send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
  }
  if (route === '/customer/me/addresses') {
    return send(res, 200, [{ id: 'a-1', street: 'Calle Falsa', number: '123', city: 'CABA', province: 'CABA', postalCode: '1043', isDefault: true }]);
  }
  if (route === '/customer/cart') return send(res, 200, { lines: [line], currency: 'ARS' });
  if (route === '/customer/shipping' && req.method === 'GET') {
    return customer ? send(res, 200, shippingSim) : send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
  }
  if (route === '/customer/shipping' && req.method === 'POST') {
    if (!customer) return send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
    const body = await readJson(req);
    if (body.optionId === 'PICKUP' || body.optionId === 'STANDARD' || body.optionId === 'EXPRESS') {
      shippingSim = { ...shippingSim, optionId: body.optionId, status: 'CONFIRMED' };
    }
    return send(res, 200, shippingSim);
  }
  if (route === '/customer/shipping/location' && req.method === 'POST') {
    if (!customer) return send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
    const body = await readJson(req);
    if (!inRange(body.latitude, -90, 90) || !inRange(body.longitude, -180, 180)) {
      return send(res, 400, { message: 'Coordenadas inválidas' });
    }
    shippingSim = { ...shippingSim, latitude: body.latitude, longitude: body.longitude };
    return send(res, 200, shippingSim);
  }
  if (route === '/customer/shipping/advance' && req.method === 'POST') {
    if (!customer) return send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
    const body = await readJson(req);
    const allowed = ['CONFIRMED', 'PREPARING', 'PACKED', 'READY_FOR_PICKUP', 'DISPATCHED', 'ARRIVING'];
    if (allowed.includes(body.status)) {
      shippingSim = { ...shippingSim, status: body.status };
    }
    return send(res, 200, shippingSim);
  }
  if (route === '/customer/billing' && req.method === 'GET') {
    return customer ? send(res, 200, billing) : send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
  }
  if (route === '/customer/billing' && req.method === 'PUT') {
    if (!customer) return send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
    const body = await readJson(req);
    const allowed = ['CONSUMIDOR_FINAL', 'MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO'];
    billing = {
      legalName: String(body.legalName || ''),
      taxId: String(body.taxId || ''),
      taxCondition: allowed.includes(body.taxCondition) ? body.taxCondition : 'CONSUMIDOR_FINAL',
      documentStatus: 'NOT_ISSUED',
    };
    return send(res, 200, billing);
  }
  if (route === '/customer/orders') return send(res, 200, [order]);
  if (route.startsWith('/customer/orders/')) {
    const found = sampleOrder(route.split('/')[3]);
    return found ? send(res, 200, found) : send(res, 404, { message: 'no' });
  }
  if (route === '/customer/checkout') {
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (body.paymentMethod === 'CASH' || body.paymentMethod === 'MERCADO_PAGO') {
        order.paymentMethod = body.paymentMethod;
      }
    }
    return send(res, 200, { orderId: 'ord-1042', paymentStatus: 'PENDING', orderStatus: 'PENDING_PAYMENT', checkoutUrl: null, paymentMethod: order.paymentMethod });
  }
  if (route === '/internal/auth/login') {
    return send(res, 200, { id: 'u-1', roles: ['ADMIN'] }, { 'set-cookie': 'sc_user=1; Path=/; SameSite=Lax' });
  }
  if (route === '/internal/auth/csrf') return send(res, 200, {});
  if (route === '/internal/me') {
    return user ? send(res, 200, { id: 'u-1', roles: ['ADMIN'] }) : send(res, 401, { errorCode: 'AUTHENTICATION_FAILED' });
  }
  if (route === '/user/catalog') return send(res, 200, products);
  if (route === '/user/promos') {
    return send(res, 200, [{
      id: 'promo-1', listingSku: 'SKU-100', currency: 'ARS', validFrom: '2026-09-26T18:00', validTo: '2026-09-26T21:00',
      priority: 1, margin: 10, approvedBy: 'operador', approvedAt: '2026-09-26T12:00',
    }]);
  }
  if (route === '/user/orders') return send(res, 200, [packed, order]);
  if (route.startsWith('/user/orders/')) {
    const found = sampleOrder(route.split('/')[3]);
    return found ? send(res, 200, found) : send(res, 404, { message: 'no' });
  }
  if (route === '/user/inventory') {
    return send(res, 200, [
      { sku: 'SKU-100', availableQuantity: 8, reservedQuantity: 2, safetyStock: 1 },
      { sku: 'SKU-101', availableQuantity: 3, reservedQuantity: 0, safetyStock: 1 },
    ]);
  }
  if (route === '/user/mercadolibre/account') return send(res, 200, { authorized: true, accountRef: 'MLA-LOCAL', status: 'LINKED' });
  if (route === '/user/mercadolibre/listings') return send(res, 200, [{ listingId: 'MLA100', variationId: '1', sku: 'SKU-100' }]);
  if (route === '/user/capabilities') {
    return send(res, 200, [
      { module: 'CATALOG', state: 'ACTIVE' },
      { module: 'INVENTORY', state: 'READ_ONLY' },
      { module: 'MERCADOLIBRE', state: 'PAUSED' },
      { module: 'CHECKOUT', state: 'DISABLED' },
      { module: 'CONTENT', state: 'ERROR' },
    ]);
  }
  if (route === '/user/profiles/preview') return send(res, 200, { compatible: true, version: '1', diff: 'sin secretos' });
  send(res, 200, {});
});

server.listen(8080, '127.0.0.1', () => {
  console.log('mock api on http://127.0.0.1:8080');
});
