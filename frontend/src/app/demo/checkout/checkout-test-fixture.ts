import { DemoProductDraftEditor } from '../catalog/product-draft-editor';
import { DemoCatalogQuery } from '../catalog/demo-catalog-query';
import { DemoCatalogCommands } from '../catalog/demo-catalog-commands';
import { DemoCartCommands, type DemoCartCommandPort } from './demo-cart-commands';
import type { DemoCheckoutSnapshot } from './checkout-model';

/** Isolated test composition; application composition belongs to the integration slice. */
export function checkoutFixture(overrides: Partial<DemoCartCommandPort> = {}) {
  const editor = new DemoProductDraftEditor(() => 'second-variant');
  const product = editor.addVariant(editor.create('TEST-1'));
  product.name = 'Producto de prueba';
  product.variants[0].onHand = 10;
  product.variants[1].onHand = 5;
  const snapshot: DemoCheckoutSnapshot = { revision: 0, products: [product], actors: [{ id: 'customer', cart: [], addresses: [{ id: 'home', label: 'Casa', street: 'Calle 1', city: 'CABA', postal: '1000', primary: true }] }], orders: [], movements: [], settings: { deliveryDays: 5 } };
  const catalog = new DemoCatalogQuery(() => snapshot);
  catalog.refreshTotals(product);
  let sequence = 0;
  const actor = (id: string) => {
    const found = snapshot.actors.find(value => value.id === id);
    if (!found) throw new Error('Identidad no encontrada.');
    return found;
  };
  const commit = () => { snapshot.revision++; };
  const commands = new DemoCatalogCommands({ catalog, snapshot: () => snapshot, requireCatalogAccess: id => { if (id !== 'admin') throw new Error('Sin permiso.'); }, requireModule: () => {}, commit });
  const cart = new DemoCartCommands({ catalog, snapshot: () => snapshot, actor, requireCustomerAccess: actor, requirePaymentAccess: (actorId, order) => { actor(actorId); if (actorId !== order.actor) throw new Error('Sin permiso para operar este pago.'); }, requireModule: () => {}, commit, id: () => String(++sequence), now: () => '2026-10-20T12:00:00Z', paymentPending: () => {}, paymentResolved: () => {}, ...overrides });
  return { snapshot, product, actor: snapshot.actors[0], catalog, commands, cart, editor };
}
