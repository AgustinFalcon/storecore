import { homeDraftSavePayload, mapCart, mapCustomerSession, mapHomeDraft, mapProductDetail, mapProductSummary, mapReceipt } from './http-mappers';

describe('http-mappers', () => {
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
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING_PAYMENT',
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/ORD-1',
    });
    expect(mapReceipt({ orderId: '9', paymentStatus: 'PENDING', orderStatus: 'PENDING_PAYMENT' }).checkoutUrl).toBeNull();
  });

  it('maps home banner blocks when present and omits them from the save payload', () => {
    const draft = mapHomeDraft({
      title: 'Vidriera',
      body: 'Texto del home',
      blocks: [
        { id: 'hero', title: 'Novedades', body: 'Lo que entra esta semana' },
        { id: 'envio', title: 'Envíos', body: 'A todo el país' },
      ],
    });
    expect(draft.blocks).toEqual([
      { id: 'hero', title: 'Novedades', body: 'Lo que entra esta semana' },
      { id: 'envio', title: 'Envíos', body: 'A todo el país' },
    ]);
    expect(homeDraftSavePayload(draft)).toEqual({ title: 'Vidriera', body: 'Texto del home' });
    expect(mapHomeDraft({ title: 'Vidriera', body: 'Texto del home' }).blocks).toBeUndefined();
  });
});
