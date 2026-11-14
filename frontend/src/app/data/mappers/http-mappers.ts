import { ProductStatus, VariantStatus, InventoryState } from '../../domain/catalog/catalog-states';
import { BoundedRows } from '../../domain/catalog/bounded-rows';
import { Cart, CartLine, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { CartCurrency } from '../../domain/cart/cart-currency';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { ProductDetail, ProductPrice, ProductVariant } from '../../domain/catalog/product-detail.entity';
import { ProductSummary, summarizeProduct } from '../../domain/catalog/product-summary.entity';
import { isArsAmount, SkuPriceResolution, VariantPricePolicy } from '../../domain/catalog/variant-price';
import { CustomerAddress, CustomerProfile, CustomerSessionResult } from '../../domain/customer/customer.entity';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from '../../domain/order/commerce-states';
import { AdminOrder, CustomerOrder } from '../../domain/order/order.entity';
import { DeliverySnapshot, OrderFact, OrderFactReason, OrderFactState, OrderPage, OrderTimelineKind } from '../../domain/order/order-projection';
import { ReturnEligibility } from '../../domain/order/return-eligibility';
import { UserRole } from '../../domain/user/user-role';
import { InventoryAvailability } from '../../domain/user/inventory-availability';
import { mapPricePolicy, mapChannelPage, mapChannelAccount, mapChannelListing } from '../user/channel-pricing.mapper';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import {
  CapabilityModule,
  InventoryRow,
  ProfilePreview,
  UserSessionResult,
} from '../../domain/user/user.entity';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta comercial no reconocida.');
  return value as Record<string, unknown>;
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Identidad o campo comercial no informado.');
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Campo comercial no reconocido.');
  return value.trim() ? value : null;
}

function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Importe comercial no informado o inválido.');
  return value;
}

export function mapCustomerSession(value: unknown): CustomerSessionResult {
  const row = asRecord(value);
  return {
    id: text(row['id']),
    email: text(row['email']),
    firstName: text(row['firstName']),
    lastName: text(row['lastName']),
  };
}

export function mapUserSession(value: unknown): UserSessionResult {
  const row = asRecord(value);
  return {
    id: text(row['id']),
    roles: items(row['roles']).map(UserRole.fromWire),
  };
}

export function mapProfile(value: unknown): CustomerProfile {
  const row = asRecord(value);
  return {
    email: text(row['email']),
    firstName: text(row['firstName']),
    lastName: text(row['lastName']),
    phone: text(row['phone']),
  };
}

export function mapAddress(value: unknown): CustomerAddress {
  const row = asRecord(value);
  return {
    id: text(row['id']),
    street: text(row['street']),
    number: text(row['number']),
    city: text(row['city']),
    province: text(row['province']),
    postalCode: text(row['postalCode']),
    isDefault: row['isDefault'] === true,
  };
}

export function mapAddresses(value: unknown): readonly CustomerAddress[] {
  return items(value).map(mapAddress);
}

export function mapFacet(value: unknown): CatalogFacet {
  const row = asRecord(value);
  return { id: text(row['id']), name: text(row['name']) };
}

export function mapFacets(value: unknown): readonly CatalogFacet[] {
  return items(value).map(mapFacet);
}

export function mapBoundedRows<T>(value: unknown, mapper: (value: unknown) => T): BoundedRows<T> {
  const row = asRecord(value);
  const total = row['total']; const page = row['page']; const size = row['size']; const entries = row['items'];
  if (!Array.isArray(entries) || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 ||
    typeof page !== 'number' || !Number.isSafeInteger(page) || page < 0 || page > 10000 ||
    typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > 50 || entries.length > size ||
    (entries.length > 0 && page * size + entries.length > total) ||
    typeof row['truncated'] !== 'boolean' || row['truncated'] !== (page * size + entries.length < total)) throw new Error('Listado no reconocido.');
  return Object.assign(entries.map(mapper), { metadata: { total, page, size, truncated: row['truncated'] } });
}
export function mapProductSummary(value: unknown): ProductSummary {
  return summarizeProduct(mapProductDetail(value));
}
export function mapProductSummaries(value: unknown): BoundedRows<ProductSummary> { return mapBoundedRows(value, mapProductSummary); }
function mapPrice(value: unknown): ProductPrice {
  const row = asRecord(value); const offer = asRecord(row['offer']);
  const base = row['base']; const effective = row['effective']; const original = row['original'];
  if (typeof base !== 'number' || !Number.isFinite(base) || base < 0 || typeof effective !== 'number' || !Number.isFinite(effective) || effective < 0 ||
    typeof original !== 'number' || !Number.isFinite(original) || original < 0 || original !== base) throw new Error('Precio no informado o inválido.');
  if (row['offer'] != null && (typeof offer['id'] !== 'string' || !offer['id'].trim() || typeof offer['name'] !== 'string' || !offer['name'].trim() || original !== base || effective > base)) throw new Error('Oferta no reconocida o contradictoria.');
  if (row['offer'] == null && (effective !== base || (original != null && original !== base))) throw new Error('Precio sin autoridad de oferta.');
  return { base, original, effective, offer: row['offer'] == null ? null : { id: offer['id'] as string, name: offer['name'] as string } };
}
function mapVariant(value: unknown, productBase: unknown): ProductVariant {
  const row = asRecord(value); const inventory = mapInventoryRow(row['inventory'] ?? { sku: row['sku'], state: 'UNKNOWN' });
  const policy = asRecord(row['pricePolicy']);
  let pricePolicy = VariantPricePolicy.fromWire(policy['mode']);
  const base = policy['base'];
  if (pricePolicy.isOverride ? !isArsAmount(base) : base !== null) pricePolicy = VariantPricePolicy.Unknown;
  let price = pricePolicy.known ? SkuPriceResolution.fromWire(row['price']) : SkuPriceResolution.Unknown;
  if (price.known && price.price!.base !== (pricePolicy.isOverride ? base : productBase)) price = SkuPriceResolution.Unknown;
  if (InventoryAvailability.fromWire(row['availability']) !== inventory.availability) throw new Error('Disponibilidad de variante contradictoria.');
  return { id: text(row['id']), sku: text(row['sku']), name: text(row['name']), status: VariantStatus.fromWire(row['status']), attributes: asRecord(row['attributes']), availableQuantity: inventory.state === InventoryState.Missing ? null : inventory.saleable, availability: inventory.availability, inventory,
    pricePolicy, basePriceOverride: pricePolicy.isOverride ? base as number : null,
    price };
}
export function mapProductDetail(value: unknown): ProductDetail {
  const row = asRecord(value); const status = ProductStatus.fromWire(row['status']);
  return { id: text(row['id']), sku: text(row['sku']), name: text(row['name']), description: text(row['description']), brand: text(row['brand']), category: text(row['category']), images: items(row['images']).map(text),
    media: items(row['media']).map(value => { const media = asRecord(value); return { id: text(media['id']), url: text(media['url']), sortOrder: num(media['sortOrder']), primary: media['primary'] === true }; }),
    variants: items(row['variants']).map(value => mapVariant(value, row['productBasePrice'])), productBasePrice: isArsAmount(row['productBasePrice']) ? row['productBasePrice'] : null,
    price: row['price'] == null ? null : mapPrice(row['price']), offerRef: text(row['offerRef']) || null, status, active: status.isPublic };
}
export function mapProductDetails(value: unknown): BoundedRows<ProductDetail> { return mapBoundedRows(value, mapProductDetail); }

function mapCartLine(value: unknown): CartLine {
  const row = requiredRecord(value);
  const quantity = row['quantity'];
  if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Cantidad comercial no informada o inválida.');
  const originalUnitPrice = money(row['originalUnitPrice']);
  const discountAmount = money(row['discountAmount']);
  const effectiveUnitPrice = money(row['effectiveUnitPrice']);
  // Decimal JSON amounts may differ by floating-point rounding after subtraction.
  const tolerance = Number.EPSILON * Math.max(originalUnitPrice, effectiveUnitPrice) * 4;
  if (discountAmount > originalUnitPrice || Math.abs(originalUnitPrice - discountAmount - effectiveUnitPrice) > tolerance) {
    throw new Error('Importes comerciales contradictorios.');
  }
  return {
    sku: requiredText(row['sku']),
    name: requiredText(row['name']),
    quantity,
    originalUnitPrice,
    discountAmount,
    offerRef: optionalText(row['offerRef']),
    campaignRef: optionalText(row['campaignRef']),
    effectiveUnitPrice,
  };
}

export function mapCart(value: unknown): Cart {
  const row = requiredRecord(value);
  if (!Array.isArray(row['lines'])) throw new Error('Líneas del carrito no informadas.');
  return { lines: row['lines'].map(mapCartLine), currency: CartCurrency.fromWire(row['currency']) };
}

export function mapReceipt(value: unknown): CheckoutReceipt {
  const row = requiredRecord(value);
  return {
    orderId: requiredText(row['orderId']),
    paymentStatus: PaymentStatus.fromWire(requiredText(row['paymentStatus'])),
    orderStatus: OrderStatus.fromWire(requiredText(row['orderStatus'])),
    checkoutUrl: optionalText(row['checkoutUrl']),
  };
}

function mapOrder(value: unknown): CustomerOrder {
  const row = asRecord(value);
  let payment = mapOrderFact(row['payment'], (raw) => {
    const status = PaymentStatus.fromWire(raw);
    return status === PaymentStatus.Unknown ? null : status;
  });
  const paymentStatus = PaymentStatus.fromWire(row['paymentStatus']);
  const orderStatus = OrderStatus.fromWire(row['orderStatus']);
  const paid = orderStatus === OrderStatus.Paid || orderStatus === OrderStatus.PaidStockReview;
  if ((payment.state === OrderFactState.Known && payment.value !== paymentStatus) ||
      (payment.state !== OrderFactState.Known && paymentStatus !== PaymentStatus.Unknown) ||
      (paid && payment.value !== PaymentStatus.Approved)) payment = contradictoryOrderFact();
  const verifiedPayment = payment.state === OrderFactState.Known && payment.value === PaymentStatus.Approved;
  return {
    orderNumber: nullableOrderText(row['orderNumber']),
    createdAt: orderDate(row['createdAt']),
    updatedAt: orderDate(row['updatedAt']),
    currency: nullableOrderText(row['currency']),
    subtotal: orderAmount(row['subtotal']),
    shippingCost: orderAmount(row['shippingCost']),
    buyerName: mapOrderFact(row['buyerName'], nullableOrderText),
    buyerEmail: mapOrderFact(row['buyerEmail'], nullableOrderText),
    delivery: mapOrderFact(row['delivery'], (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const address = asRecord(raw);
      if (!['recipient', 'street', 'city', 'province', 'postalCode', 'country'].every((key) => key in address && (address[key] === null || typeof address[key] === 'string'))) return null;
      return Object.fromEntries(['recipient', 'street', 'city', 'province', 'postalCode', 'country'].map((key) => [key, nullableOrderText(address[key])])) as unknown as DeliverySnapshot;
    }),
    payment,
    timeline: mapOrderFact(row['timeline'], (raw) => Array.isArray(raw) && raw.every((event) => {
      const entry = asRecord(event);
      return nullableOrderText(entry['id']) !== null && orderDate(entry['occurredAt']) !== null;
    }) ? raw.map((event) => {
      const entry = asRecord(event);
      return { id: text(entry['id']), kind: OrderTimelineKind.fromWire(entry['kind']), occurredAt: orderDate(entry['occurredAt']) };
    }) : null),
    returnEligibility: verifiedPayment ? ReturnEligibility.fromWire(row['returnEligibility']) : ReturnEligibility.PaymentUnverified,
    id: text(row['id']),
    orderStatus: paid && !verifiedPayment ? OrderStatus.Unknown : orderStatus,
    paymentStatus: payment.state === OrderFactState.Known ? payment.value! : PaymentStatus.Unknown,
    shipmentStatus: ShipmentStatus.fromWire(row['shipmentStatus']),
    tracking: text(row['tracking']) || null,
    total: num(row['total']),
    lines: items(row['lines']).map(mapCartLine),
  };
}

function nullableOrderText(raw: unknown): string | null { return typeof raw === 'string' && raw.trim() ? raw : null; }
function orderDate(raw: unknown): string | null { return typeof raw === 'string' && Number.isFinite(Date.parse(raw)) ? raw : null; }
function orderAmount(raw: unknown): number | null { return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null; }
function mapOrderFact<T>(raw: unknown, translate: (value: unknown) => T | null): OrderFact<T> {
  const row = asRecord(raw);
  const state = OrderFactState.fromWire(row['state']);
  if (state === OrderFactState.Known) {
    const value = translate(row['value']);
    return value === null || row['reason'] != null ? contradictoryOrderFact() : { state, value, reason: null };
  }
  if (row['value'] != null) return contradictoryOrderFact();
  const reason = row['reason'] == null ? null : OrderFactReason.fromWire(row['reason']);
  if (state === OrderFactState.Unavailable && (reason === null || (reason === OrderFactReason.Unknown && row['reason'] !== OrderFactReason.Unknown.wire))) return contradictoryOrderFact();
  if (state === OrderFactState.Unknown && reason !== null && reason !== OrderFactReason.Unknown) return contradictoryOrderFact();
  return { state, value: null, reason };
}

function contradictoryOrderFact<T>(): OrderFact<T> { return { state: OrderFactState.Unavailable, value: null, reason: OrderFactReason.SourceContradictory }; }

export function mapOrderPage<T>(raw: unknown, translate: (value: unknown) => T): OrderPage<T> {
  const rows = mapBoundedRows(raw, translate);
  return { items: [...rows], ...rows.metadata };
}

export function mapCustomerOrder(value: unknown): CustomerOrder {
  return mapOrder(value);
}

export function mapCustomerOrders(value: unknown): readonly CustomerOrder[] {
  return items(value).map(mapOrder);
}

export function mapAdminOrder(value: unknown): AdminOrder {
  const row = asRecord(value);
  const order = mapOrder(value);
  const verified = order.payment.state === OrderFactState.Known && order.payment.value === PaymentStatus.Approved;
  return { ...order, rmaStatus: RmaStatus.fromWire(row['rmaStatus']), fulfillmentEligibility: FulfillmentEligibility.fromWire(row['fulfillmentEligibility']).withPaymentStatus(order.paymentStatus), shipmentAction: !verified || row['shipmentAction'] == null ? null : ShipmentTransition.fromWire(row['shipmentAction']), rmaAction: !verified || row['rmaAction'] == null ? null : RmaTransition.fromWire(row['rmaAction']) };
}

export function mapAdminOrders(value: unknown): readonly AdminOrder[] {
  return items(value).map(mapAdminOrder);
}

export const mapPromo = mapPricePolicy;
export function mapPromos(value: unknown) { return mapChannelPage(value, mapPricePolicy); }

export function mapPreview(value: unknown): ProfilePreview {
  const row = asRecord(value);
  if (typeof row['compatible'] !== 'boolean' || typeof row['version'] !== 'string' || typeof row['diff'] !== 'string') {
    throw new Error('Respuesta de importación no reconocida.');
  }
  return {
    compatible: row['compatible'],
    version: row['version'],
    diff: row['diff'],
  };
}

export function mapCapability(value: unknown): CapabilityModule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La lectura de módulos contiene una fila inválida.');
  }
  const row = asRecord(value);
  if (typeof row['module'] !== 'string' || !row['module'].trim()) {
    throw new Error('La lectura de módulos contiene un identificador inválido.');
  }
  const version = row['configVersion'];
  return {
    id: CapabilityModuleId.fromWire(row['module']),
    state: CapabilityModuleState.fromWire(row['state']),
    configVersion: typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : null,
  };
}

export function mapCapabilities(value: unknown): readonly CapabilityModule[] {
  if (!Array.isArray(value)) throw new Error('La lectura de módulos no es válida.');
  const wires = new Set<string>();
  for (const valueRow of value) {
    const row = asRecord(valueRow);
    const wire = typeof row['module'] === 'string' ? row['module'].trim() : '';
    if (wire && wires.has(wire)) throw new Error('La lectura de módulos contiene identificadores duplicados.');
    if (wire) wires.add(wire);
  }
  return value.map(mapCapability);
}

export function mapInventory(value: unknown): BoundedRows<InventoryRow> { return mapBoundedRows(value, mapInventoryRow); }
export function mapInventoryRow(value: unknown): InventoryRow {
  const row = asRecord(value);
  if (typeof row['sku'] !== 'string' || !row['sku'].trim()) throw new Error('La lectura de inventario contiene un SKU inválido.');
  const state = InventoryState.fromWire(row['state']);
  const availableQuantity = state === InventoryState.Known ? inventoryQuantity(row['available']) : null;
  const reservedQuantity = state === InventoryState.Known ? inventoryQuantity(row['reserved']) : null;
  const safetyStock = state === InventoryState.Known ? inventoryQuantity(row['safety']) : null;
  const valid = availableQuantity !== null && reservedQuantity !== null && safetyStock !== null;
  if (state === InventoryState.Known && (!valid || !Number.isSafeInteger(availableQuantity + reservedQuantity) || row['onHand'] !== availableQuantity + reservedQuantity || row['saleable'] !== Math.max(availableQuantity - safetyStock, 0))) throw new Error('Saldo de inventario contradictorio.');
  if (state !== InventoryState.Known && ['available', 'reserved', 'safety', 'onHand', 'saleable'].some(key => row[key] !== null)) throw new Error('Saldo sin autoridad de inventario.');
  return { variantId: text(row['variantId']), sku: row['sku'].trim(), productName: text(row['productName']), variantLabel: text(row['variantLabel']), availableQuantity, reservedQuantity, safetyStock, state, updatedAt: text(row['updatedAt']) || null,
    onHand: valid ? availableQuantity + reservedQuantity : null, saleable: valid ? Math.max(availableQuantity - safetyStock, 0) : null, availability: InventoryAvailability.fromQuantities(availableQuantity, reservedQuantity, safetyStock, state) };
}

function inventoryQuantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export const mapMercadoLibreAccount = mapChannelAccount;
export const mapListing = mapChannelListing;
export function mapListings(value: unknown) { return mapChannelPage(value, mapChannelListing); }
