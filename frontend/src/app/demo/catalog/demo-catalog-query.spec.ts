import { checkoutFixture } from '../checkout/checkout-test-fixture';
import { ProductCondition, VariantSaleState } from './catalog-types';
import { DemoCatalogQuery } from './demo-catalog-query';

describe('DemoCatalogQuery', () => {
  it('uses explicit variant identity and rejects unknown identifiers', () => {
    const { catalog, product } = checkoutFixture();
    expect(catalog.variant(product.sku, product.variants[0].id)).toBe(product.variants[0]);
    expect(() => catalog.variant(product.sku, 'invented')).toThrow('ya no está disponible');
  });
  it('excludes disabled, reserved, retained and unknown-condition stock', () => {
    const { catalog, product } = checkoutFixture();
    product.variants[0].reserved = 2;
    product.variants[0].notSellable = 1;
    product.variants[1].saleState = VariantSaleState.Disabled;
    expect(catalog.available(product.sku)).toBe(7);
    product.variants[0].condition = ProductCondition.Unknown;
    expect(catalog.available(product.sku)).toBe(0);
  });
  it('projects aggregates and delegates commercial prices through a policy port', () => {
    const { snapshot, product, catalog } = checkoutFixture();
    product.variants[1].saleState = VariantSaleState.Disabled;
    product.variants[1].price = 1;
    catalog.refreshTotals(product);
    expect(product.onHand).toBe(15);
    expect(product.price).toBe(product.variants[0].price);
    const query = new DemoCatalogQuery(() => snapshot, (_product, variant, available) => ({ amount: available ? variant.price - 100 : variant.price }));
    expect(query.price(product.sku)).toBe(product.price - 100);
  });
});
