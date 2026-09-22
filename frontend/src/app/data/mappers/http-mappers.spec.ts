import { mapCart, mapCustomerSession, mapProductDetail } from './http-mappers';

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
});
