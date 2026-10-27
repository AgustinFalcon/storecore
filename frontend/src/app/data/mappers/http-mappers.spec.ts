import { mapAdminOrder, mapCart, mapCustomerSession, mapInventory, mapProductDetail, mapProductSummary, mapReceipt } from './http-mappers';
import { InventoryAvailability } from '../../domain/user/inventory-availability';
import { FulfillmentEligibility, OrderStatus, PaymentStatus, RmaStatus, ShipmentStatus, ShipmentTransition } from '../../domain/order/commerce-states';

describe('http-mappers', () => {
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
