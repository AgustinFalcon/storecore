import { checkoutFixture } from '../checkout/checkout-test-fixture';
import { DemoScenario } from '../demo-model';
import { CatalogValidationError, DemoSnapshotConflict, OutletScope, ProductCondition, ProductPublication, VariantSaleState } from './catalog-types';
import { DemoProductPolicy } from './product-policy';
import { ChangeDemoProductPublicationCommand, SaveDemoProductCommand } from './product-commands';
import { DemoCatalogWire } from './catalog-wire';
import { addOutletFixture } from './outlet-fixture';

describe('closed catalog contracts', () => {
  it('roundtrips closed states and maps future values to Unknown at one boundary', () => {
    for (const type of [ProductPublication, VariantSaleState, ProductCondition, OutletScope]) {
      expect(type.fromWire('future')).toBe(type.Unknown);
      expect(type.fromWire(null)).toBe(type.Unknown);
      expect(type.Unknown.label).not.toContain('future');
    }
    expect(ProductPublication.fromWire(ProductPublication.Published.wire)).toBe(ProductPublication.Published);
    expect(VariantSaleState.fromWire(VariantSaleState.Active.wire)).toBe(VariantSaleState.Active);
    expect(ProductCondition.fromWire(ProductCondition.Standard.wire)).toBe(ProductCondition.Standard);
    expect(OutletScope.fromWire(OutletScope.Unit.wire)).toBe(OutletScope.Unit);
    const { snapshot, catalog, product } = checkoutFixture();
    expect(DemoCatalogWire.product(JSON.parse(JSON.stringify(product)))).toEqual(product);
    const raw = JSON.parse(JSON.stringify(product)); raw.publication = 'future-secret';
    snapshot.products[0] = DemoCatalogWire.product(raw);
    expect(catalog.available(product.sku)).toBe(0);
    expect(snapshot.products[0].publication).toBe(ProductPublication.Unknown);
  });
  it('shares price and stock invariants between writes and JSON decoding', () => {
    const { commands, product, snapshot } = checkoutFixture();
    const proposal = DemoProductPolicy.clone(product);
    proposal.variants[0].original = proposal.variants[0].price - 1;
    const before = JSON.stringify(snapshot);
    expect(() => commands.saveProduct('admin', proposal, product.sku)).toThrow(CatalogValidationError);
    expect(() => DemoCatalogWire.product(JSON.parse(JSON.stringify(proposal)))).toThrow(CatalogValidationError);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('archives without altering variants or historical order snapshots', () => {
    const { product, cart, commands, snapshot } = checkoutFixture();
    cart.add('customer', product.sku, 1, product.variants[0].id);
    cart.checkout('customer', 'historic', 'home', DemoScenario.Approved);
    const historic = JSON.stringify(snapshot.orders);
    const variants = JSON.stringify(product.variants);
    new ChangeDemoProductPublicationCommand('admin', product, snapshot.revision).execute(commands);
    expect(product.publication).toBe(ProductPublication.Archived);
    expect(JSON.stringify(product.variants)).toBe(variants);
    expect(JSON.stringify(snapshot.orders)).toBe(historic);
  });
  it('rejects unauthorized, stale and unknown-state writes without mutation', () => {
    const { commands, product, snapshot } = checkoutFixture();
    const command = new SaveDemoProductCommand('admin', product, product.sku, snapshot.revision);
    snapshot.revision++;
    const before = JSON.stringify(snapshot);
    expect(() => command.execute(commands)).toThrow(DemoSnapshotConflict);
    expect(() => commands.saveProduct('customer', product, product.sku)).toThrow('permiso');
    expect(JSON.stringify(snapshot)).toBe(before);
    product.publication = ProductPublication.Unknown;
    expect(() => commands.saveProduct('admin', product, product.sku)).toThrow('desconocidos');
  });
  it('preserves reservations and validates isolated Outlet unit/lot details', () => {
    const { commands, product, snapshot, catalog } = checkoutFixture();
    product.variants[0].reserved = 2;
    const proposal = DemoProductPolicy.clone(product); proposal.variants[0].saleState = VariantSaleState.Disabled;
    expect(() => commands.saveProduct('admin', proposal, product.sku)).toThrow('reservas');
    addOutletFixture(snapshot);
    const outlet = catalog.product('VLD-043');
    expect(catalog.available(outlet.sku)).toBe(0);
    expect(DemoCatalogWire.product(JSON.parse(JSON.stringify(outlet)))).toEqual(outlet);
    outlet.variants[0].onHand = 2;
    expect(() => DemoProductPolicy.validate(outlet)).toThrow('unidad');
    outlet.variants[0].outlet!.scope = OutletScope.Lot;
    expect(() => DemoProductPolicy.validate(outlet)).not.toThrow();
  });
});
