import { createHash } from 'node:crypto';

class ClosedWireType {
  constructor(wire, label) { this.wire = wire; this.label = label; Object.freeze(this); }
}

export class PresentationRunState extends ClosedWireType {
  static Create = new PresentationRunState('CREATE', 'Crear');
  static Replay = new PresentationRunState('REPLAY', 'Revalidar');
  static Unknown = new PresentationRunState('UNKNOWN', 'Desconocido');
  static values = Object.freeze([this.Create, this.Replay]);
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export class PresentationPricePolicyState extends ClosedWireType {
  static Draft = new PresentationPricePolicyState('DRAFT', 'Borrador');
  static Active = new PresentationPricePolicyState('ACTIVE', 'Activa');
  static Paused = new PresentationPricePolicyState('PAUSED', 'Pausada');
  static Unknown = new PresentationPricePolicyState('UNKNOWN', 'Desconocida');
  static values = Object.freeze([this.Draft, this.Active, this.Paused]);
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export class PresentationPricePolicyTransition extends ClosedWireType {
  static Activate = new PresentationPricePolicyTransition('ACTIVATE', 'Activar');
  static Pause = new PresentationPricePolicyTransition('PAUSE', 'Pausar');
  static Unknown = new PresentationPricePolicyTransition('UNKNOWN', 'Desconocida');
  static values = Object.freeze([this.Activate, this.Pause]);
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export class PresentationOrderStatus extends ClosedWireType {
  static PendingPayment = new PresentationOrderStatus('PENDING_PAYMENT', 'Pendiente de pago');
  static Unknown = new PresentationOrderStatus('UNKNOWN', 'Desconocido');
  static values = Object.freeze([this.PendingPayment]);
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export class PresentationDeliveryMode extends ClosedWireType {
  static LocalDelivery = new PresentationDeliveryMode('LOCAL_DELIVERY', 'Envío local');
  static StorePickup = new PresentationDeliveryMode('PICKUP', 'Retiro en local');
  static Unknown = new PresentationDeliveryMode('UNKNOWN', 'Desconocido');
  static values = Object.freeze([this.LocalDelivery, this.StorePickup]);
  static fromWire(raw) { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

const firstNames = Object.freeze(['Martina', 'Joaquín', 'Valentina', 'Benjamín', 'Camila', 'Mateo', 'Lucía', 'Santino', 'Catalina', 'Tomás', 'Sofía', 'Bautista', 'Julieta', 'Franco', 'Agustina', 'Thiago', 'Malena', 'Lautaro', 'Emilia', 'Facundo', 'Delfina', 'Nicolás', 'Renata', 'Ramiro']);
const lastNames = Object.freeze(['Pereyra', 'Gómez', 'Fernández', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez', 'Rojas', 'Molina', 'Castro', 'Silva', 'Ortiz', 'Núñez', 'Cabrera', 'Luna', 'Vega']);
const cities = Object.freeze([
  ['Córdoba', 'Córdoba', '5000'], ['Rosario', 'Santa Fe', '2000'], ['Mendoza', 'Mendoza', '5500'],
  ['La Plata', 'Buenos Aires', '1900'], ['San Miguel de Tucumán', 'Tucumán', '4000'], ['Salta', 'Salta', '4400'],
  ['Mar del Plata', 'Buenos Aires', '7600'], ['Neuquén', 'Neuquén', '8300'],
]);
const streets = Object.freeze(['San Martín', 'Belgrano', 'Sarmiento', 'Mitre', 'Rivadavia', 'General Paz', 'Independencia', 'Las Heras']);

function deterministicUuid(namespace, ordinal) {
  const hex = createHash('sha256').update(`${namespace}:${ordinal}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function address(ordinal, secondary = false) {
  const [city, province, postalCode] = cities[(ordinal + (secondary ? 3 : 0)) % cities.length];
  return Object.freeze({
    street: streets[(ordinal + (secondary ? 2 : 0)) % streets.length],
    number: String(410 + ordinal * 37 + (secondary ? 7 : 0)), city, province, postalCode,
    isDefault: !secondary,
  });
}

function requireProducts(products) {
  if (!Array.isArray(products) || products.length < 40) throw new Error('PRESENTATION_PRODUCTS_INSUFFICIENT');
  const eligible = products.filter(product => typeof product?.sku === 'string' && Number.isSafeInteger(product.stock) && product.stock >= 8 && Number.isFinite(product.price) && product.price > 0);
  if (eligible.length < 36 || new Set(eligible.map(product => product.sku)).size !== eligible.length) throw new Error('PRESENTATION_PRODUCTS_INVALID');
  return eligible;
}

export function presentationVolumeDataset(products) {
  const eligible = requireProducts(products);
  const customers = firstNames.map((firstName, index) => {
    const ordinal = index + 1;
    const orderProduct = eligible[(index + 12) % eligible.length];
    const cartProduct = eligible[(index + 36) % eligible.length];
    const favoriteProducts = [eligible[(index + 3) % eligible.length], eligible[(index + 27) % eligible.length]];
    return Object.freeze({
      key: `customer-${String(ordinal).padStart(2, '0')}`,
      email: `demo.cliente.${String(ordinal).padStart(2, '0')}@storecore.invalid`,
      password: 'StoreCore-demo-volume-2026!', firstName, lastName: lastNames[index],
      addresses: Object.freeze(index % 2 === 0 ? [address(index), address(index, true)] : [address(index)]),
      orderSku: orderProduct.sku, cartSku: cartProduct.sku,
      favoriteSkus: Object.freeze(favoriteProducts.map(product => product.sku)),
      idempotencyKey: deterministicUuid('storecore-presentation-volume-v1', ordinal),
      deliveryMode: index % 3 === 0 ? PresentationDeliveryMode.StorePickup : PresentationDeliveryMode.LocalDelivery,
    });
  });
  const policies = eligible.slice(0, 12).map((product, index) => Object.freeze({
    key: `policy-${String(index + 1).padStart(2, '0')}`, sku: product.sku,
    desiredPrice: Math.max(100, Math.round(Number(product.price) * (0.94 - (index % 3) * 0.02))),
    target: index < 4 ? PresentationPricePolicyState.Draft : index < 8 ? PresentationPricePolicyState.Active : PresentationPricePolicyState.Paused,
  }));
  const body = { schemaVersion: 1, namespace: 'storecore-presentation-volume-v1', customers, policies };
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return Object.freeze({ ...body, digest });
}
