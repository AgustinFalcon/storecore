import { Cart, CartLine, CheckoutReceipt } from '../../domain/cart/cart.entity';
import { CatalogFacet } from '../../domain/catalog/catalog-facet.entity';
import { HomeContent, HomeBlock } from '../../domain/catalog/home-content.entity';
import { ProductDetail, ProductPrice, ProductVariant } from '../../domain/catalog/product-detail.entity';
import { ProductSummary } from '../../domain/catalog/product-summary.entity';
import { CustomerAddress, CustomerProfile, CustomerSessionResult } from '../../domain/customer/customer.entity';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, RmaTransition, ShipmentStatus, ShipmentTransition } from '../../domain/order/commerce-states';
import { AdminOrder, CustomerOrder } from '../../domain/order/order.entity';
import { UserRole } from '../../domain/user/user-role';
import { InventoryAvailability } from '../../domain/user/inventory-availability';
import { MercadoLibreAccountStatus } from '../../domain/user/mercadolibre-account-status';
import {
  CapabilityModule,
  CapabilityState,
  HomeContentDraft,
  InventoryRow,
  ManualPromo,
  MercadoLibreAccount,
  MercadoLibreListing,
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

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

export function mapProductSummary(value: unknown): ProductSummary {
  const row = asRecord(value);
  const price = asRecord(row['price']);
  const effective = num(typeof row['price'] === 'object' ? price['effective'] : row['effective'] ?? row['price']);
  const original = nullableNum(row['originalPrice'] ?? row['basePrice'] ?? price['base']);
  const image = text(row['imageUrl'] ?? row['image'] ?? items(row['images'])[0]) || null;
  return {
    sku: text(row['sku']),
    name: text(row['name']),
    price: effective,
    originalPrice: original !== null && original > effective ? original : null,
    imageUrl: image,
    offerRef: text(row['offerRef']) || null,
  };
}

export function mapProductSummaries(value: unknown): readonly ProductSummary[] {
  return items(value).map(mapProductSummary);
}

function mapPrice(value: unknown): ProductPrice {
  const row = asRecord(value);
  return {
    base: num(row['base']),
    desired: nullableNum(row['desired']),
    observed: nullableNum(row['observed']),
    effective: num(row['effective']),
    priceVersion: text(row['priceVersion']),
  };
}

function mapVariant(value: unknown): ProductVariant {
  const row = asRecord(value);
  return {
    id: text(row['id']),
    sku: text(row['sku']),
    name: text(row['name']),
    availableQuantity: num(row['availableQuantity']),
  };
}

export function mapProductDetail(value: unknown): ProductDetail {
  const row = asRecord(value);
  return {
    sku: text(row['sku']),
    name: text(row['name']),
    description: text(row['description']),
    brand: text(row['brand']),
    category: text(row['category']),
    images: items(row['images']).map(text),
    variants: items(row['variants']).map(mapVariant),
    price: mapPrice(row['price']),
    offerRef: text(row['offerRef']) || null,
    active: row['active'] !== false,
  };
}

export function mapProductDetails(value: unknown): readonly ProductDetail[] {
  return items(value).map(mapProductDetail);
}

export function mapHome(value: unknown): HomeContent {
  const row = asRecord(value);
  return {
    title: text(row['title']),
    blocks: items(row['blocks']).map((block) => {
      const item = asRecord(block);
      const mapped: HomeBlock = { id: text(item['id']), title: text(item['title']), body: text(item['body']) };
      return mapped;
    }),
  };
}

export function mapHomeDraft(value: unknown): HomeContentDraft {
  const row = asRecord(value);
  return { title: text(row['title']), body: text(row['body']) };
}

function mapCartLine(value: unknown): CartLine {
  const row = asRecord(value);
  return {
    sku: text(row['sku']),
    name: text(row['name']),
    quantity: num(row['quantity']),
    originalUnitPrice: num(row['originalUnitPrice']),
    discountAmount: num(row['discountAmount']),
    offerRef: text(row['offerRef']) || null,
    campaignRef: text(row['campaignRef']) || null,
    effectiveUnitPrice: num(row['effectiveUnitPrice']),
  };
}

export function mapCart(value: unknown): Cart {
  const row = asRecord(value);
  return { lines: items(row['lines']).map(mapCartLine), currency: text(row['currency']) };
}

export function mapReceipt(value: unknown): CheckoutReceipt {
  const row = asRecord(value);
  return {
    orderId: text(row['orderId']),
    paymentStatus: PaymentStatus.fromWire(row['paymentStatus']),
    orderStatus: OrderStatus.fromWire(row['orderStatus']),
    checkoutUrl: text(row['checkoutUrl']) || null,
  };
}

function mapOrder(value: unknown): CustomerOrder {
  const row = asRecord(value);
  return {
    id: text(row['id']),
    orderStatus: OrderStatus.fromWire(row['orderStatus']),
    paymentStatus: PaymentStatus.fromWire(row['paymentStatus']),
    shipmentStatus: ShipmentStatus.fromWire(row['shipmentStatus']),
    tracking: text(row['tracking']) || null,
    total: num(row['total']),
    lines: items(row['lines']).map(mapCartLine),
  };
}

export function mapCustomerOrder(value: unknown): CustomerOrder {
  return mapOrder(value);
}

export function mapCustomerOrders(value: unknown): readonly CustomerOrder[] {
  return items(value).map(mapOrder);
}

export function mapAdminOrder(value: unknown): AdminOrder {
  const row = asRecord(value);
  return { ...mapOrder(value), rmaStatus: RmaStatus.fromWire(row['rmaStatus']), fulfillmentEligibility: FulfillmentEligibility.fromWire(row['fulfillmentEligibility']), shipmentAction: row['shipmentAction'] == null ? null : ShipmentTransition.fromWire(row['shipmentAction']), rmaAction: row['rmaAction'] == null ? null : RmaTransition.fromWire(row['rmaAction']) };
}

export function mapAdminOrders(value: unknown): readonly AdminOrder[] {
  return items(value).map(mapAdminOrder);
}

export function mapPromo(value: unknown): ManualPromo {
  const row = asRecord(value);
  return {
    id: text(row['id']),
    listingSku: text(row['listingSku']),
    currency: text(row['currency']),
    validFrom: text(row['validFrom']),
    validTo: text(row['validTo']),
    priority: num(row['priority']),
    margin: num(row['margin']),
    approvedBy: text(row['approvedBy']),
    approvedAt: text(row['approvedAt']),
    writer: 'MANUAL',
  };
}

export function mapPromos(value: unknown): readonly ManualPromo[] {
  return items(value).map(mapPromo);
}

export function mapPreview(value: unknown): ProfilePreview {
  const row = asRecord(value);
  return {
    compatible: row['compatible'] === true,
    version: text(row['version']),
    diff: text(row['diff']),
  };
}

const CAPABILITY_STATES: readonly CapabilityState[] = ['DISABLED', 'READ_ONLY', 'ACTIVE', 'PAUSED', 'ERROR'];

export function mapCapability(value: unknown): CapabilityModule {
  const row = asRecord(value);
  const state = text(row['state']) as CapabilityState;
  return {
    module: text(row['module']),
    state: CAPABILITY_STATES.includes(state) ? state : 'DISABLED',
  };
}

export function mapCapabilities(value: unknown): readonly CapabilityModule[] {
  return items(value).map(mapCapability);
}

export function mapInventory(value: unknown): readonly InventoryRow[] {
  if (!Array.isArray(value)) throw new Error('La lectura de inventario no es válida.');
  return value.map((item) => {
    const row = asRecord(item);
    if (typeof row['sku'] !== 'string' || !row['sku'].trim()) {
      throw new Error('La lectura de inventario contiene un SKU inválido.');
    }
    const availableQuantity = inventoryQuantity(row['availableQuantity']);
    const reservedQuantity = inventoryQuantity(row['reservedQuantity']);
    const safetyStock = inventoryQuantity(row['safetyStock']);
    return {
      sku: row['sku'].trim(),
      availableQuantity,
      reservedQuantity,
      safetyStock,
      availability: InventoryAvailability.fromQuantities(availableQuantity, reservedQuantity, safetyStock),
    };
  });
}

function inventoryQuantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function mapMercadoLibreAccount(value: unknown): MercadoLibreAccount {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La lectura de la cuenta de Mercado Libre no es válida.');
  }
  const row = value as Record<string, unknown>;
  if (typeof row['authorized'] !== 'boolean' || typeof row['accountRef'] !== 'string') {
    throw new Error('La lectura de la cuenta de Mercado Libre está incompleta.');
  }
  const accountRef = row['accountRef'].trim();
  const status = MercadoLibreAccountStatus.fromWire(row['status']);
  if (row['authorized'] && (!accountRef || status === MercadoLibreAccountStatus.Disabled)) {
    throw new Error('La cuenta autorizada de Mercado Libre tiene una referencia o un estado inválido.');
  }
  if (!row['authorized'] && (accountRef || (status !== MercadoLibreAccountStatus.Disabled && status !== MercadoLibreAccountStatus.Unknown))) {
    throw new Error('La cuenta no autorizada de Mercado Libre tiene un estado contradictorio.');
  }
  return {
    authorized: row['authorized'],
    accountRef,
    status,
  };
}

export function mapListing(value: unknown): MercadoLibreListing {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La lectura de publicaciones de Mercado Libre contiene una fila inválida.');
  }
  const row = value as Record<string, unknown>;
  if (typeof row['listingId'] !== 'string' || !row['listingId'].trim()) {
    throw new Error('La publicación de Mercado Libre no tiene un identificador válido.');
  }
  if (typeof row['variationId'] !== 'string') {
    throw new Error('La publicación de Mercado Libre no tiene una variación válida.');
  }
  if (typeof row['sku'] !== 'string' || !row['sku'].trim()) {
    throw new Error('La publicación de Mercado Libre no tiene un SKU válido.');
  }
  return { listingId: row['listingId'].trim(), variationId: row['variationId'].trim(), sku: row['sku'].trim() };
}

export function mapListings(value: unknown): readonly MercadoLibreListing[] {
  if (!Array.isArray(value)) throw new Error('La lectura de publicaciones de Mercado Libre no es válida.');
  const listings = value.map(mapListing);
  const identities = new Set<string>();
  for (const listing of listings) {
    const identity = JSON.stringify([listing.listingId, listing.variationId]);
    if (identities.has(identity)) {
      throw new Error('La lectura de publicaciones de Mercado Libre contiene una identidad duplicada.');
    }
    identities.add(identity);
  }
  return listings;
}
