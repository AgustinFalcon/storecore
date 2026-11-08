import { mapAdminOrder, mapCapabilities, mapCart, mapCustomerSession, mapInventory, mapListings, mapMercadoLibreAccount, mapPreview, mapProductDetail, mapProductSummary, mapReceipt } from './http-mappers';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { InventoryAvailability } from '../../domain/user/inventory-availability';
import { MercadoLibreAccountStatus } from '../../domain/user/mercadolibre-account-status';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, ShipmentStatus, ShipmentTransition } from '../../domain/order/commerce-states';
import { InventoryState } from '../../domain/catalog/catalog-states';

const inventoryPage = (items: unknown[]) => ({ items, total: items.length, page: 0, size: 50, truncated: false });

describe('http-mappers', () => {
  it('retains the profile diff wire text and rejects invalid compatibility instead of coercing it', () => {
    const result = { compatible: true, version: '1.0.0', diff: '[ ]' };
    expect(mapPreview(result)).toEqual(result);
    expect(mapPreview({ ...result, compatible: false }).compatible).toBe(false);
    for (const compatible of [undefined, null, 'true', 'false', 1, 0, {}, []]) expect(() => mapPreview({ ...result, compatible })).toThrow(/no reconocida/);
    for (const row of [null, [], {}, { ...result, version: null }, { ...result, diff: [] }]) expect(() => mapPreview(row)).toThrow();
  });
  it('decodes capability identifiers, states and versions without inventing a disabled state', () => {
    expect(mapCapabilities([
      { module: 'CATALOG', state: 'ACTIVE', configVersion: 8 },
      { module: 'FUTURE_MODULE', state: 'FUTURE_STATE', configVersion: 'bad' },
    ])).toEqual([
      { id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Active, configVersion: 8 },
      { id: CapabilityModuleId.Unknown, state: CapabilityModuleState.Unknown, configVersion: null },
    ]);
  });

  it('rejects malformed capability collections, rows, identities and duplicate typed ids', () => {
    for (const invalid of [undefined, null, {}, { items: [] }, true, 0, '[]']) expect(() => mapCapabilities(invalid)).toThrow();
    for (const invalid of [null, [], {}, { module: '' }, { module: '  ' }, { module: 12 }, { module: false }]) {
      expect(() => mapCapabilities([invalid])).toThrow();
    }
    expect(() => mapCapabilities([
      { module: 'CATALOG', state: 'ACTIVE', configVersion: 1 },
      { module: 'CATALOG', state: 'READ_ONLY', configVersion: 2 },
    ])).toThrow(/duplicados/i);
    expect(mapCapabilities([
      { module: 'FUTURE_A', state: 'ACTIVE', configVersion: 1 },
      { module: 'FUTURE_B', state: 'ACTIVE', configVersion: 2 },
    ])).toHaveLength(2);
  });

  it('decodes the Mercado Libre account through its closed status translator', () => {
    expect(mapMercadoLibreAccount({ authorized: true, accountRef: ' seller-42 ', status: 'ACTIVE' })).toEqual({
      authorized: true,
      accountRef: 'seller-42',
      status: MercadoLibreAccountStatus.Active,
    });
    expect(mapMercadoLibreAccount({ authorized: false, accountRef: '', status: 'FUTURE_STATE' }).status)
      .toBe(MercadoLibreAccountStatus.Unknown);
    expect(mapMercadoLibreAccount({ authorized: false, accountRef: '', status: 'DISABLED' })).toEqual({
      authorized: false,
      accountRef: '',
      status: MercadoLibreAccountStatus.Disabled,
    });
  });

  it('rejects malformed Mercado Libre account identities and wire shapes', () => {
    for (const invalid of [null, undefined, [], '', 1, true, {}, { authorized: 'true', accountRef: '', status: 'ACTIVE' },
      { authorized: false, accountRef: 2, status: 'DISABLED' }, { authorized: true, accountRef: '  ', status: 'ACTIVE' }]) {
      expect(() => mapMercadoLibreAccount(invalid)).toThrow();
    }
    for (const contradictory of [
      { authorized: false, accountRef: 'seller-42', status: 'DISABLED' },
      { authorized: false, accountRef: '', status: 'ACTIVE' },
      { authorized: false, accountRef: '', status: 'READ_ONLY' },
      { authorized: true, accountRef: 'seller-42', status: 'DISABLED' },
    ]) expect(() => mapMercadoLibreAccount(contradictory)).toThrow(/cuenta/i);
  });

  it('decodes unique Mercado Libre listing identities without coercion', () => {
    expect(mapListings([
      { listingId: ' MLA-1 ', variationId: '', sku: ' SKU-1 ' },
      { listingId: 'MLA-1', variationId: ' VAR-2 ', sku: 'SKU-2' },
    ])).toEqual([
      { listingId: 'MLA-1', variationId: '', sku: 'SKU-1' },
      { listingId: 'MLA-1', variationId: 'VAR-2', sku: 'SKU-2' },
    ]);
    expect(mapListings([])).toEqual([]);
  });

  it('fails closed for malformed or duplicate Mercado Libre listings', () => {
    for (const invalid of [undefined, null, {}, { items: [] }, '', 1, true]) expect(() => mapListings(invalid)).toThrow();
    for (const row of [null, [], {}, { listingId: '', variationId: '', sku: 'SKU' },
      { listingId: 1, variationId: '', sku: 'SKU' }, { listingId: 'MLA', variationId: null, sku: 'SKU' },
      { listingId: 'MLA', variationId: '', sku: ' ' }, { listingId: 'MLA', variationId: '', sku: 1 }]) {
      expect(() => mapListings([row])).toThrow();
    }
    expect(() => mapListings([
      { listingId: ' MLA-1 ', variationId: ' VAR-1 ', sku: 'SKU-1' },
      { listingId: 'MLA-1', variationId: 'VAR-1', sku: 'SKU-2' },
    ])).toThrow(/duplicada/);
  });

  it('decodes authoritative inventory without quantity coercion or subtraction', () => {
    const rows = mapInventory(inventoryPage([{ sku: ' SKU-1 ', state: 'KNOWN', available: 8, reserved: 20, safety: 3, onHand: 28, saleable: 5 }]));
    expect(rows[0]).toMatchObject({ sku: 'SKU-1', availableQuantity: 8, reservedQuantity: 20, safetyStock: 3, onHand: 28, saleable: 5, availability: InventoryAvailability.Normal });
    expect(mapInventory(inventoryPage([]))).toHaveLength(0);
  });

  it('preserves unknown inventory quantities rather than manufacturing zero', () => {
    for (const invalid of [undefined, null, '', '4', true, false, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      for (const field of ['available', 'reserved', 'safety']) {
        expect(() => mapInventory(inventoryPage([{ sku: 'SKU-1', state: 'KNOWN', available: 0, reserved: 0, safety: 0, onHand: 0, saleable: 0, [field]: invalid }]))).toThrow();
      }
    }
  });

  it('rejects malformed inventory collections and SKU identities as failed reads', () => {
    for (const invalid of [undefined, null, {}, { items: [] }, true, 0, '[]']) expect(() => mapInventory(invalid)).toThrow();
    for (const invalid of [null, [], {}, { sku: '' }, { sku: '  ' }, { sku: 12 }, { sku: false }]) {
      expect(() => mapInventory(inventoryPage([{ sku: 'valid' }, invalid]))).toThrow();
    }
  });

  it('legacy or malformed state never becomes an allowed action', () => {
    const unknown = mapAdminOrder({ orderStatus: 'UNTRUSTED', paymentStatus: null, shipmentStatus: null, rmaStatus: null, shipmentAction: 'PACKED' });
    expect(unknown.orderStatus).toBe(OrderStatus.Unknown);
    expect(unknown.paymentStatus).toBe(PaymentStatus.Unknown);
    expect(unknown.shipmentStatus).toBe(ShipmentStatus.Unknown);
    expect(unknown.rmaStatus).toBe(RmaStatus.Unknown);
    expect(unknown.fulfillmentEligibility).toBe(FulfillmentEligibility.Unknown);
    const absent = mapAdminOrder({ shipmentStatus: 'NOT_CREATED', rmaStatus: 'NONE', fulfillmentEligibility: 'ELIGIBLE', shipmentAction: 'PACKED' });
    expect(absent.shipmentStatus).toBe(ShipmentStatus.NotCreated);
    expect(absent.rmaStatus).toBe(RmaStatus.None);
    expect(absent.shipmentAction).toBe(ShipmentTransition.Packed);
  });

  it('distinguishes missing inventory from known zero and preserves bounded metadata', () => {
    const rows = mapInventory({ items: [
      { sku: 'missing', state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null },
      { sku: 'zero', state: 'KNOWN', available: 0, reserved: 4, safety: 0, onHand: 4, saleable: 0 },
      { sku: 'safety', state: 'KNOWN', available: 2, reserved: 3, safety: 2, onHand: 5, saleable: 0 },
    ], total: 120, page: 0, size: 50, truncated: true });
    expect(rows.metadata).toEqual({ total: 120, page: 0, size: 50, truncated: true });
    expect(rows[0]).toMatchObject({ state: InventoryState.Missing, availableQuantity: null, reservedQuantity: null, safetyStock: null, onHand: null, saleable: null, availability: InventoryAvailability.Unavailable });
    expect(rows[1]).toMatchObject({ onHand: 4, saleable: 0, availability: InventoryAvailability.Out });
    expect(rows[2]).toMatchObject({ onHand: 5, saleable: 0, availability: InventoryAvailability.Out });
  });

  it('rejects absent or contradictory list bounds and never invents a total', () => {
    const page = inventoryPage([{ sku: 'SKU', state: InventoryState.Missing.wire, available: null, reserved: null, safety: null, onHand: null, saleable: null }]);
    expect(mapInventory(page)).toHaveLength(1);
    for (const patch of [{ total: -1 }, { total: 0 }, { page: -1 }, { size: 0 }, { size: 51 }, { total: 100, truncated: false }, { truncated: true }, { total: undefined }]) {
      expect(() => mapInventory({ ...page, ...patch })).toThrow();
    }
    expect(() => mapInventory(page.items)).toThrow();
    const last = { ...page, total: 51, page: 1, truncated: true };
    expect(mapInventory(last).metadata).toMatchObject({ total: 51, page: 1, truncated: true });
    expect(() => mapInventory({ ...last, truncated: false })).toThrow();
    expect(mapInventory({ ...last, items: [], page: 2 }).metadata.truncated).toBe(true);
  });

  it('rejects contradictory stock, variant availability and partial offer facts', () => {
    const inventory = { sku: 'SKU', state: InventoryState.Known.wire, available: 8, reserved: 3, safety: 2, onHand: 11, saleable: 6 };
    for (const patch of [{ onHand: 5 }, { saleable: 3 }, { onHand: undefined }, { state: InventoryState.Missing.wire }, { state: InventoryState.Unknown.wire }]) {
      expect(() => mapInventory(inventoryPage([{ ...inventory, ...patch }]))).toThrow();
    }
    expect(() => mapProductDetail({ price: { base: 10, original: 10, effective: 10 }, variants: [{ sku: 'SKU', availability: InventoryAvailability.Out.wire, inventory }] })).toThrow();
    for (const price of [
      { base: 10, effective: 10, offer: null },
      { base: 10, effective: 10, original: null, offer: null },
      { base: 10, effective: 8, original: 10, offer: {} },
      { base: 10, effective: 8, original: null, offer: { id: '1', name: 'Oferta' } },
      { base: 10, effective: 12, original: 10, offer: { id: '1', name: 'Oferta' } },
      { base: 10, effective: 8, original: 10, offer: null },
    ]) expect(() => mapProductSummary({ sku: 'SKU', price })).toThrow();
  });
  it('maps a customer session without a token', () => {
    expect(mapCustomerSession({ id: 3, email: 'a@b.c', firstName: 'A', lastName: 'B' })).toEqual({
      id: '3',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
    });
  });

  it('fills missing product fields without mixing prices', () => {
    const product = mapProductDetail({ sku: 'SKU-1', price: { effective: 10, base: 10, original: 10 } });
    expect(product.sku).toBe('SKU-1');
    expect(product.price.effective).toBe(10);
    expect(product.price.base).toBe(10);
    expect(product.price.original).toBe(10);
    expect(product.images).toEqual([]);
    expect(product.active).toBe(false);
  });

  it('maps a cart with no lines as empty', () => {
    expect(mapCart({})).toEqual({ lines: [], currency: '' });
  });

  it('keeps storefront cards on the effective price and uses only API media', () => {
    expect(
      mapProductSummary({
        sku: 'SKU-1',
        name: 'Lámpara',
        price: { effective: 80, base: 100, original: 100, offer: { id: 'O-1', name: 'Oferta' } },
        images: ['https://cdn.example.test/lamp.jpg'],
        offerRef: 'O-1',
      }),
    ).toEqual({
      sku: 'SKU-1',
      name: 'Lámpara',
      price: 80,
      originalPrice: 100,
      imageUrl: 'https://cdn.example.test/lamp.jpg',
      offerRef: 'O-1',
    });
  });

  it('maps an optional allowlisted checkout url without treating it as payment proof', () => {
    expect(
      mapReceipt({
        orderId: '9',
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING_PAYMENT',
        checkoutUrl: 'https://www.mercadopago.com.ar/checkout/ORD-1',
      }),
    ).toEqual({
      orderId: '9',
      paymentStatus: PaymentStatus.Pending,
      orderStatus: OrderStatus.PendingPayment,
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/ORD-1',
    });
    expect(mapReceipt({ orderId: '9', paymentStatus: 'PENDING', orderStatus: 'PENDING_PAYMENT' }).checkoutUrl).toBeNull();
  });
});
