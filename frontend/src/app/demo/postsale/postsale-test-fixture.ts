import { ShipmentStatus } from '../../domain/order/shipment-status';
import { DemoDeliveryMethod } from '../demo-process-types';
import { DemoScenario } from '../demo-model';
import { checkoutFixture } from '../checkout/checkout-test-fixture';
import { DemoPostSaleCommands, type DemoPostSaleSnapshot } from './demo-postsale-commands';

export function postSaleFixture() {
  const base = checkoutFixture();
  base.cart.add('customer', base.product.sku, 3, base.product.variants[0].id);
  base.cart.add('customer', base.product.sku, 2, base.product.variants[1].id);
  const order = base.cart.checkout('customer', 'post-sale-order', 'home', DemoScenario.Approved, undefined, DemoDeliveryMethod.Home);
  order.shipment = ShipmentStatus.Delivered;
  const snapshot = Object.assign(base.snapshot, { returns: [], postSaleAlerts: [] }) as DemoPostSaleSnapshot;
  let sequence = 0;
  const commands = new DemoPostSaleCommands({
    catalog: base.catalog,
    snapshot: () => snapshot,
    requireCustomerAccess: actorId => { if (actorId !== 'customer') throw new Error('Sin permiso de comprador.'); },
    requireAdminAccess: actorId => { if (actorId !== 'admin') throw new Error('Sin permiso administrativo.'); },
    commit: () => { snapshot.revision++; },
    now: () => '2026-10-20T15:00:00Z',
    id: () => String(++sequence),
  });
  return { ...base, snapshot, commands, order };
}
