import type { DemoProduct } from './catalog-model';
import { CatalogValidationError, OutletScope, ProductCondition, ProductPublication, VariantSaleState } from './catalog-types';
import { DemoProductPolicy } from './product-policy';

const wire = (raw: unknown): unknown => raw !== null && typeof raw === 'object' && 'wire' in raw ? raw.wire : raw;

/** The sole catalog JSON boundary; unknown states retain safe labels and zero availability. */
export class DemoCatalogWire {
  static product(raw: unknown): DemoProduct {
    if (!raw || typeof raw !== 'object') throw new CatalogValidationError('Producto inválido.');
    const source = raw as DemoProduct;
    if (!Array.isArray(source.variants)) throw new CatalogValidationError('Variantes inválidas.');
    const product: DemoProduct = {
      ...source,
      publication: ProductPublication.fromWire(wire(source.publication)),
      variants: source.variants.map(variant => ({
        ...variant,
        saleState: VariantSaleState.fromWire(wire(variant.saleState)),
        condition: ProductCondition.fromWire(wire(variant.condition)),
        outlet: variant.outlet ? { ...variant.outlet, scope: OutletScope.fromWire(wire(variant.outlet.scope)) } : null,
      })),
    };
    DemoProductPolicy.validate(product, true);
    return DemoProductPolicy.clone(product);
  }
}
