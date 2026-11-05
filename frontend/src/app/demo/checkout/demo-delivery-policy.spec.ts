import { DemoDeliveryMethod } from '../demo-process-types';
import { DemoDeliveryPolicy } from './demo-delivery-policy';
import { checkoutFixture } from './checkout-test-fixture';

describe('DemoDeliveryPolicy', () => {
  it('requires compatible configured locations for every cart line', () => {
    const { product, cart, actor, catalog } = checkoutFixture();
    expect(DemoDeliveryPolicy.forVariant(product.variants[0])).toEqual([DemoDeliveryMethod.Home]);
    product.variants[0].pickupLocation = 'Sucursal';
    expect(DemoDeliveryPolicy.forVariant(product.variants[0])).toContain(DemoDeliveryMethod.Pickup);
    cart.add(actor.id, product.sku, 1, product.variants[0].id);
    cart.add(actor.id, product.sku, 1, product.variants[1].id);
    const variant = (sku: string, id: string) => catalog.variant(sku, id);
    expect(DemoDeliveryPolicy.pickupLocation(actor.cart, variant)).toBeNull();
    product.variants[1].pickupLocation = 'Sucursal';
    expect(DemoDeliveryPolicy.pickupLocation(actor.cart, variant)).toBe('Sucursal');
  });
});
