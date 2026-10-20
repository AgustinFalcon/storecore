import { DemoScenario } from '../demo-model';
import { DemoDeliveryMethod } from '../demo-process-types';
import { ProductPublication } from '../catalog/catalog-types';
import { DemoProductPolicy } from '../catalog/product-policy';
import { DemoReservationState } from './demo-reservation-state';
import { checkoutFixture } from './checkout-test-fixture';

describe('variant cart commands', () => {
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
    expect(() => cart.checkout(actor.id, 'changed', 'home', DemoScenario.Approved)).toThrow('precio');
    expect(JSON.stringify(snapshot)).toBe(before);
    cart.confirmQuote(actor.id);
    expect(cart.needsReconfirmation(actor.id)).toBe(false);
    product.publication = ProductPublication.Archived;
    expect(() => cart.confirmQuote(actor.id)).toThrow();
    expect(() => cart.checkout(actor.id, 'archived', 'home', DemoScenario.Approved)).toThrow('archivado');
  });
  it('freezes historical product details and makes request replay idempotent', () => {
    const { cart, commands, product, actor, snapshot } = checkoutFixture();
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    const order = cart.checkout(actor.id, 'approved', 'home', DemoScenario.Approved);
    const historic = JSON.stringify(order);
    const proposal = DemoProductPolicy.clone(product);
    proposal.name = 'Nombre nuevo'; proposal.variants[0].label = 'Variante nueva'; proposal.variants[0].attributes = [{ name: 'Nuevo', value: 'Atributo' }]; proposal.media[0].alt = 'Imagen nueva';
    commands.saveProduct('admin', proposal, product.sku);
    expect(JSON.stringify(order)).toBe(historic);
    expect(cart.checkout(actor.id, 'approved', 'home', DemoScenario.Approved)).toBe(order);
    expect(snapshot.orders).toHaveLength(1);
    expect(snapshot.movements).toHaveLength(1);
  });
  it('retains cart on simulated errors, creates no reservation on rejection, and checks pickup facts', () => {
    const { cart, product, actor, snapshot } = checkoutFixture();
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    const before = JSON.stringify(snapshot);
    expect(() => cart.checkout(actor.id, 'error', 'home', DemoScenario.Error)).toThrow();
    expect(() => cart.checkout(actor.id, 'pickup', '', DemoScenario.Approved, undefined, DemoDeliveryMethod.Pickup)).toThrow('retiro');
    expect(JSON.stringify(snapshot)).toBe(before);
    const order = cart.checkout(actor.id, 'rejected', 'home', DemoScenario.Rejected);
    expect(order.reservation!.state).toBe(DemoReservationState.None);
    expect([product.variants[0].onHand, product.variants[0].reserved]).toEqual([10, 0]);
  });
});
