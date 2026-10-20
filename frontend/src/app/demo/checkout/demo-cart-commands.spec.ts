import { DemoModuleId, DemoScenario } from '../demo-model';
import { DemoDeliveryMethod } from '../demo-process-types';
import { ProductPublication } from '../catalog/catalog-types';
import { DemoProductPolicy } from '../catalog/product-policy';
import { DemoReservationState } from './demo-reservation-state';
import { checkoutFixture } from './checkout-test-fixture';

describe('variant cart commands', () => {
  it('rejects empty or missing variant IDs before changing an existing cart', () => {
    const { cart, product, actor, snapshot } = checkoutFixture();
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    const before = JSON.stringify(snapshot);
    for (const id of ['', ' ', undefined as unknown as string]) {
      expect(() => cart.setQuantity(actor.id, product.sku, id, 5)).toThrow('variante válida');
      expect(() => cart.add(actor.id, product.sku, 1, id)).toThrow('variante válida');
      expect(() => cart.remove(actor.id, product.sku, id)).toThrow('variante válida');
      expect(JSON.stringify(snapshot)).toBe(before);
    }
  });
  it('requires concrete delivery, enforces the shipping gate and charges Home delivery', () => {
    let shippingAllowed = false;
    const modules: DemoModuleId[] = [];
    const { cart, actor, product, snapshot } = checkoutFixture({ requireModule: module => { modules.push(module); if (module === DemoModuleId.Shipping && !shippingAllowed) throw new Error('Envíos pausados.'); } });
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    const before = JSON.stringify(snapshot);
    for (const delivery of [undefined, DemoDeliveryMethod.Unknown]) {
      expect(() => cart.checkout(actor.id, 'invalid-delivery', 'home', DemoScenario.Approved, undefined, delivery as DemoDeliveryMethod)).toThrow('entrega válida');
      expect(JSON.stringify(snapshot)).toBe(before);
    }
    expect(() => cart.checkout(actor.id, 'paused-shipping', 'home', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home)).toThrow('pausados');
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(modules).toContain(DemoModuleId.Shipping);
    shippingAllowed = true;
    const order = cart.checkout(actor.id, 'with-shipping', 'home', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home);
    expect(order.delivery!.method).toBe(DemoDeliveryMethod.Home);
    expect(order.total).toBe(product.variants[0].price + DemoDeliveryMethod.Home.cost);
  });
  it('allows configured pickup without Shipping and records its zero cost', () => {
    const { cart, product, actor } = checkoutFixture({ requireModule: module => { if (module === DemoModuleId.Shipping) throw new Error('Shipping disabled'); } });
    product.variants[0].pickupLocation = 'Sucursal';
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    const order = cart.checkout(actor.id, 'pickup', '', DemoScenario.Approved, undefined, DemoDeliveryMethod.Pickup);
    expect(order.delivery).toMatchObject({ method: DemoDeliveryMethod.Pickup, cost: 0, destination: 'Sucursal' });
    expect(order.total).toBe(product.variants[0].price);
  });
  it('keeps separate lines by variant and validates quantities before mutation', () => {
    const { cart, product, actor } = checkoutFixture();
    const [first, second] = product.variants;
    cart.add(actor.id, product.sku, 2, first.id);
    cart.add(actor.id, product.sku, 1, second.id);
    expect(actor.cart.map(line => [line.variantId, line.quantity])).toEqual([[first.id, 2], [second.id, 1]]);
    const before = JSON.stringify(actor.cart);
    for (const quantity of [0, -1, 1.5, 11]) expect(() => cart.setQuantity(actor.id, product.sku, first.id, quantity)).toThrow();
    expect(() => cart.add(actor.id, product.sku, 1, 'unknown')).toThrow();
    expect(JSON.stringify(actor.cart)).toBe(before);
    cart.remove(actor.id, product.sku, first.id);
    expect(actor.cart.map(line => line.variantId)).toEqual([second.id]);
  });
  it('requires explicit price reconfirmation and blocks archived or unavailable products', () => {
    const { cart, product, actor, snapshot } = checkoutFixture();
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    product.variants[0].price += 100;
    expect(cart.needsReconfirmation(actor.id)).toBe(true);
    const before = JSON.stringify(snapshot);
    expect(() => cart.checkout(actor.id, 'changed', 'home', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home)).toThrow('precio');
    expect(JSON.stringify(snapshot)).toBe(before);
    cart.confirmQuote(actor.id);
    expect(cart.needsReconfirmation(actor.id)).toBe(false);
    product.publication = ProductPublication.Archived;
    expect(() => cart.confirmQuote(actor.id)).toThrow();
    expect(() => cart.checkout(actor.id, 'archived', 'home', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home)).toThrow('archivado');
  });
  it('freezes historical product details and makes request replay idempotent', () => {
    const { cart, commands, product, actor, snapshot } = checkoutFixture();
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    const order = cart.checkout(actor.id, 'approved', 'home', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home);
    const historic = JSON.stringify(order);
    const proposal = DemoProductPolicy.clone(product);
    proposal.name = 'Nombre nuevo'; proposal.variants[0].label = 'Variante nueva'; proposal.variants[0].attributes = [{ name: 'Nuevo', value: 'Atributo' }]; proposal.media[0].alt = 'Imagen nueva';
    commands.saveProduct('admin', proposal, product.sku);
    expect(JSON.stringify(order)).toBe(historic);
    expect(cart.checkout(actor.id, 'approved', 'home', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home)).toBe(order);
    expect(snapshot.orders).toHaveLength(1);
    expect(snapshot.movements).toHaveLength(1);
  });
  it('retains cart on simulated errors, creates no reservation on rejection, and checks pickup facts', () => {
    const { cart, product, actor, snapshot } = checkoutFixture();
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    const before = JSON.stringify(snapshot);
    expect(() => cart.checkout(actor.id, 'error', 'home', DemoScenario.Error, undefined, DemoDeliveryMethod.Home)).toThrow();
    expect(() => cart.checkout(actor.id, 'pickup', '', DemoScenario.Approved, undefined, DemoDeliveryMethod.Pickup)).toThrow('retiro');
    expect(JSON.stringify(snapshot)).toBe(before);
    const order = cart.checkout(actor.id, 'rejected', 'home', DemoScenario.Rejected, undefined, DemoDeliveryMethod.Home);
    expect(order.reservation!.state).toBe(DemoReservationState.None);
    expect([product.variants[0].onHand, product.variants[0].reserved]).toEqual([10, 0]);
  });
});
