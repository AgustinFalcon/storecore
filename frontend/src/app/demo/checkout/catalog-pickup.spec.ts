import { DemoCommerce, DemoProductVariant, DemoScenario, decodeSnapshot, demoSeed } from '../demo-model';
import { DemoDeliveryMethod } from '../demo-process-types';
import { CatalogDetailsRead } from '../rich-catalog/catalog-details';
import { VariantSaleState } from '../catalog/catalog-types';
import { PickupAvailability, PickupDestination, QuoteCatalogPickupStep } from './catalog-pickup';

describe('configured pickup eligibility', () => {
  const step = new QuoteCatalogPickupStep();
  it('closes availability and rejects malformed configured destinations at the persistence boundary', () => {
    for (const value of PickupAvailability.all) expect(PickupAvailability.fromWire(value.wire)).toBe(value);
    expect(PickupAvailability.fromWire('future')).toBe(PickupAvailability.Unknown);
    expect(PickupDestination.fromWire(undefined)).toBe(PickupDestination.NotConfigured);
    for (const value of [null, '', ' ', 1, {}, 'x'.repeat(241)]) {
      expect(PickupDestination.fromWire(value)).toBe(PickupDestination.Unknown);
      const raw = JSON.parse(JSON.stringify(demoSeed())); raw.catalogDetails[0].variants[0].pickupLocation = value;
      expect(() => decodeSnapshot(JSON.stringify(raw))).toThrow();
    }
    const stored = decodeSnapshot(JSON.stringify(demoSeed()));
    expect(CatalogDetailsRead.presentation(stored, 'DEMO-002', DemoProductVariant.Standard)?.pickupLocation).toContain('Sucursal');
    expect(CatalogDetailsRead.presentation(stored, 'DEMO-001', DemoProductVariant.Standard)?.pickupLocation).toBeUndefined();
  });
  it('requires the same configured destination for every active selected presentation', () => {
    const state = demoSeed(), line = { sku: 'DEMO-002', variant: DemoProductVariant.Standard };
    expect(step.execute(state, []).availability).toBe(PickupAvailability.NotConfigured);
    expect(step.execute(state, [line]).availability).toBe(PickupAvailability.Configured);
    expect(step.execute(state, [line, { sku: 'DEMO-001', variant: DemoProductVariant.Standard }]).availability).toBe(PickupAvailability.NotConfigured);
    const other = CatalogDetailsRead.presentation(state, 'DEMO-003', DemoProductVariant.Standard)!;
    other.pickupLocation = 'Otra sucursal';
    expect(step.execute(state, [line, { sku: 'DEMO-003', variant: DemoProductVariant.Standard }]).availability).toBe(PickupAvailability.NotConfigured);
    other.pickupLocation = step.execute(state, [line]).location;
    expect(step.execute(state, [line, { sku: 'DEMO-003', variant: DemoProductVariant.Standard }]).availability).toBe(PickupAvailability.Configured);
    other.state = VariantSaleState.Disabled;
    expect(step.execute(state, [{ sku: 'DEMO-003', variant: DemoProductVariant.Standard }]).availability).toBe(PickupAvailability.Unknown);
    expect(step.execute(state, [{ sku: 'DEMO-002', variant: DemoProductVariant.Unknown }]).availability).toBe(PickupAvailability.Unknown);
  });
  it('blocks bypassed pickup atomically and preserves the cart for home delivery', () => {
    const commerce = new DemoCommerce(demoSeed()); commerce.add('cliente', 'DEMO-001', 1);
    const before = JSON.stringify(commerce.snapshot);
    expect(() => commerce.checkout('cliente', 'invalid-pickup', '', DemoScenario.Approved, undefined, DemoDeliveryMethod.Pickup)).toThrow('Retiro no disponible');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
    const order = commerce.checkout('cliente', 'home', 'address-cliente', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home);
    expect(order.delivery?.method).toBe(DemoDeliveryMethod.Home);
  });
  it('persists the configured destination and invalidates pickup when configuration changes', () => {
    const commerce = new DemoCommerce(demoSeed()); commerce.add('cliente', 'DEMO-002', 1);
    const destination = step.execute(commerce.snapshot, commerce.actor('cliente').cart).location;
    const order = commerce.checkout('cliente', 'valid-pickup', '', DemoScenario.Approved, undefined, DemoDeliveryMethod.Pickup);
    expect(order.delivery?.destination).toBe(destination); expect(order.addressId).toBeUndefined();
    expect(decodeSnapshot(JSON.stringify(commerce.snapshot)).orders.at(-1)?.delivery?.destination).toBe(destination);
  });
});
