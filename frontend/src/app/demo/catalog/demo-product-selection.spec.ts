import { DemoProductVariant as Variant } from '../demo-model';
import { DemoProductSelection } from './demo-product-selection';

const query = (values: Record<string, string>) => ({ get: (key: string) => values[key] ?? null });
describe('Product URL selection boundary', () => {
  it('restores canonical supported variants and whole quantities without clamping', () => {
    const selected = DemoProductSelection.fromWire(query({ variant: Variant.Case.wire, quantity: '2' }), Variant.all, 5);
    expect(selected.variant).toBe(Variant.Case); expect(selected.quantity).toBe(2);
    const defaults = DemoProductSelection.fromWire(query({}), [Variant.Standard], 0);
    expect(defaults.variant).toBe(Variant.Standard); expect(defaults.quantity).toBe(1);
  });
  it.each(['invented', 'kit-completo', ''])('maps unsupported variants %s to Unknown', raw => {
    expect(DemoProductSelection.fromWire(query({ variant: raw }), Variant.all, 5).variant).toBe(Variant.Unknown);
  });
  it('does not select an unavailable presentation for a different SKU', () => {
    expect(DemoProductSelection.fromWire(query({ variant: Variant.Case.wire }), [Variant.Standard], 5).variant).toBe(Variant.Unknown);
  });
  it.each(['', '0', '-1', '1.5', 'NaN', 'Infinity', '1e2', '6', '9007199254740992'])('leaves invalid quantity %s non-purchasable', raw => {
    expect(Number.isNaN(DemoProductSelection.fromWire(query({ quantity: raw }), Variant.all, 5).quantity)).toBe(true);
  });
});
