import { mapAdminOrder, mapCapabilities, mapCart, mapCustomerSession, mapInventory, mapListings, mapMercadoLibreAccount, mapProductDetail, mapProductSummary, mapReceipt } from './http-mappers';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { InventoryAvailability } from '../../domain/user/inventory-availability';
import { MercadoLibreAccountStatus } from '../../domain/user/mercadolibre-account-status';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, ShipmentStatus, ShipmentTransition } from '../../domain/order/commerce-states';

describe('http-mappers', () => {
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
    expect(mapInventory([{ sku: ' SKU-1 ', availableQuantity: 8, reservedQuantity: 20, safetyStock: 3 }])).toEqual([
      { sku: 'SKU-1', availableQuantity: 8, reservedQuantity: 20, safetyStock: 3, availability: InventoryAvailability.Normal },
    ]);
    expect(mapInventory([])).toEqual([]);
  });

  it('preserves unknown inventory quantities rather than manufacturing zero', () => {
    for (const invalid of [undefined, null, '', '4', true, false, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      for (const field of ['availableQuantity', 'reservedQuantity', 'safetyStock']) {
        const row = mapInventory([{ sku: 'SKU-1', availableQuantity: 0, reservedQuantity: 0, safetyStock: 0, [field]: invalid }])[0];
        expect(row[field as 'availableQuantity' | 'reservedQuantity' | 'safetyStock']).toBeNull();
        expect(row.availability).toBe(InventoryAvailability.Unknown);
      }
    }
  });

  it('rejects malformed inventory collections and SKU identities as failed reads', () => {
    for (const invalid of [undefined, null, {}, { items: [] }, true, 0, '[]']) expect(() => mapInventory(invalid)).toThrow();
    for (const invalid of [null, [], {}, { sku: '' }, { sku: '  ' }, { sku: 12 }, { sku: false }]) {
      expect(() => mapInventory([{ sku: 'valid' }, invalid])).toThrow();
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
  it('maps a customer session without a token', () => {
    expect(mapCustomerSession({ id: 3, email: 'a@b.c', firstName: 'A', lastName: 'B' })).toEqual({
      id: '3',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
    });
  });

  it('fills missing product fields without mixing prices', () => {
    const product = mapProductDetail({ sku: 'SKU-1', price: { effective: 12, base: 10 } });
    expect(product.sku).toBe('SKU-1');
    expect(product.price.effective).toBe(12);
    expect(product.price.base).toBe(10);
    expect(product.price.desired).toBeNull();
    expect(product.images).toEqual([]);
    expect(product.active).toBe(true);
  });

  it('maps a cart with no lines as empty', () => {
    expect(mapCart({})).toEqual({ lines: [], currency: '' });
  });

  it('keeps storefront cards on the effective price and uses only API media', () => {
    expect(
      mapProductSummary({
        sku: 'SKU-1',
        name: 'Lámpara',
        price: { effective: 80, base: 100 },
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
