import { DiscountType } from './discount-type';

describe('DiscountType', () => {
  it('formats the operator amount without inventing a price', () => {
    expect(DiscountType.fromWire('PERCENT').format('10')).toBe('10 %');
    expect(DiscountType.fromWire('FIXED').format('150')).toBe('fijo 150');
    expect(DiscountType.fromWire('PERCENT').format('')).toBe('Porcentaje');
  });

  it('does not treat an unknown wire as a valid discount kind', () => {
    expect(DiscountType.fromWire('BOGO')).toBe(DiscountType.Unknown);
    expect(DiscountType.fromWire('BOGO').format('10')).toBe('Tipo de descuento no reconocido');
  });
});
