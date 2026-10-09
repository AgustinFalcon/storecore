import { DemoCommerce, demoSeed, DemoScenario, decodeSnapshot, DemoCurrency } from './demo-model';
import { validateMedia } from './demo-catalog';

describe('variant commerce', () => {
  for (const cancelled of [false, true]) it(`recovers rejected/cancelled exact standard, case and open identities: ${cancelled}`, () => {
    const state = new DemoCommerce(demoSeed());
    const product = structuredClone(state.product('DEMO-001'));
    product.variants!.push({ ...structuredClone(product.variants![0]), id: 'admin-open', name: 'Abierta XL' });
    state.saveProduct(product, product.sku);
    const identities = state.variants(product.sku).map(value => value.id);
    for (const id of identities) state.add('cliente', product.sku, 1, id);
    const order = state.checkout('cliente', 'retry', 'address-cliente', cancelled ? DemoScenario.Pending : DemoScenario.Rejected);
    if (cancelled) state.cancelPayment(order.id);
    state.retryOrder('cliente', order.id);
    expect(state.actor('cliente').cart.map(line => line.variantId)).toEqual(identities);
    expect(state.actor('cliente').cart.map(line => line.quantity)).toEqual([1, 1, 1]);
  });
  it('rejects archived, insufficient and absent retry identities atomically', () => {
    const state = new DemoCommerce(demoSeed()); const [a, b] = state.variants('DEMO-001');
    state.add('cliente', 'DEMO-001', 1, a.id); state.add('cliente', 'DEMO-001', 1, b.id);
    const order = state.checkout('cliente', 'retry', 'address-cliente', DemoScenario.Rejected);
    b.active = false;
    expect(() => state.retryOrder('cliente', order.id)).toThrow('archivada'); expect(state.actor('cliente').cart).toEqual([]);
    b.active = true; b.onHand = 0;
    expect(() => state.retryOrder('cliente', order.id)).toThrow('stock'); expect(state.actor('cliente').cart).toEqual([]);
    b.onHand = 3; delete order.lines[1].variantId;
    expect(() => state.retryOrder('cliente', order.id)).toThrow('identidad'); expect(state.actor('cliente').cart).toEqual([]);
    expect(() => state.retryOrder('cliente2', order.id)).toThrow('pedido');
  });
  const commerce = () => new DemoCommerce(demoSeed(), () => '2026-10-09T00:00:00Z', () => 'variants-order');
  it('allows the same product twice and only merges the same variant', () => {
    const state=commerce(); const [a,b]=state.variants('DEMO-001');
    state.add('cliente','DEMO-001',1,a.id); state.add('cliente','DEMO-001',1,b.id); state.add('cliente','DEMO-001',1,a.id);
    expect(state.actor('cliente').cart.map(line => [line.variantId,line.quantity])).toEqual([[a.id,2],[b.id,1]]);
    state.setQuantity('cliente','DEMO-001',3,a.id); expect(state.actor('cliente').cart[1].quantity).toBe(1);
    state.remove('cliente','DEMO-001',a.id); expect(state.actor('cliente').cart[0].variantId).toBe(b.id);
  });
  it('consumes only selected inventory and freezes attributes, media, price and discount', () => {
    const state=commerce(); const [a,b]=state.variants('DEMO-001'); const stock=a.onHand;
    state.add('cliente','DEMO-001',1,b.id); const order=state.checkout('cliente','purchase','address-cliente',DemoScenario.Approved);
    expect(a.onHand).toBe(stock); expect(b.onHand).toBe(2); expect(order.lines[0].currency).toBe(DemoCurrency.ARS);
    const historical=JSON.stringify(order.lines); const edited=structuredClone(state.product('DEMO-001')); edited.variants![1].name='Nueva presentación'; edited.variants![1].price+=1000; edited.variants![1].attributes[0].value='Nuevo';
    state.saveProduct(edited,edited.sku); expect(JSON.stringify(order.lines)).toBe(historical);
    expect(decodeSnapshot(JSON.stringify(state.snapshot)).orders.at(-1)!.lines[0].variantId).toBe(b.id);
  });
  it('requires an explicit refreshed summary after a price change and preserves the cart', () => {
    const state=commerce(); const a=state.variants('DEMO-001')[0]; state.add('cliente','DEMO-001',1,a.id);
    const edited=structuredClone(state.product('DEMO-001')); edited.variants![0].price+=1000; state.saveProduct(edited,edited.sku);
    expect(()=>state.checkout('cliente','changed','address-cliente',DemoScenario.Approved)).toThrow('precio cambió'); expect(state.actor('cliente').cart).toHaveLength(1);
    state.refreshCart('cliente'); expect(state.checkout('cliente','changed','address-cliente',DemoScenario.Approved).lines[0].unit).toBe(state.variantPrice(edited.sku,a.id));
  });
  it('blocks unknown/archived variants and invalid stock without changing valid variants', () => {
    const state=commerce(); const before=JSON.stringify(state.snapshot); expect(()=>state.add('cliente','DEMO-001',1,'missing')).toThrow('variante');
    for(const quantity of [0,-1,.5,Number.NaN,Infinity]) expect(()=>state.add('cliente','DEMO-001',quantity,state.variants('DEMO-001')[0].id)).toThrow();
    expect(JSON.stringify(state.snapshot)).toBe(before); const variant=state.variants('DEMO-001')[1]; variant.active=false; expect(()=>state.add('cliente','DEMO-001',1,variant.id)).toThrow('stock');
  });
  it('keeps pending reservations per variant through reload and cancellation', () => {
    const state=commerce(); const [a,b]=state.variants('DEMO-001'); state.add('cliente','DEMO-001',2,b.id); const order=state.checkout('cliente','pending','address-cliente',DemoScenario.Pending);
    expect(a.reserved).toBe(0); expect(b.reserved).toBe(2); const restored=new DemoCommerce(decodeSnapshot(JSON.stringify(state.snapshot))); restored.cancelPayment(order.id);
    expect(restored.sellable('DEMO-001',b.id).reserved).toBe(0); expect(restored.sellable('DEMO-001',b.id).onHand).toBe(3);
  });
  it('migrates legacy standard identity and preserves historical money without guessing unknown variants', () => {
    const legacy=demoSeed(); legacy.version=1; legacy.products.forEach(product=>{delete product.variants;delete product.images;}); legacy.actors[0].cart=[{sku:'DEMO-001',quantity:1,variant: {wire:'standard'} as never}];
    const restored=decodeSnapshot(JSON.stringify(legacy)); expect(restored.version).toBe(2); expect(restored.actors[0].cart[0].variantId).toBe('DEMO-001:standard');
    legacy.actors[0].cart[0].variant={wire:'alien'} as never; expect(()=>decodeSnapshot(JSON.stringify(legacy))).toThrow('migrarse');
  });
  it('rejects remote media and empty alt and permits honest empty galleries', () => { expect(()=>validateMedia([{id:'x',src:'https://other/image.svg',alt:'x'}])).toThrow(); expect(()=>validateMedia([{id:'x',src:'/assets/demo/DEMO-001.svg',alt:''}])).toThrow(); expect(()=>validateMedia([])).not.toThrow(); });
  it('refuses monetary overflow before consuming stock or creating an order', () => { const state=commerce(); state.snapshot.campaigns=[]; const variant=state.variants('DEMO-001')[0]; variant.price=Number.MAX_SAFE_INTEGER; state.add('cliente','DEMO-001',2,variant.id); const before=JSON.stringify(state.snapshot); expect(()=>state.checkout('cliente','overflow','address-cliente',DemoScenario.Approved)).toThrow('precisión'); expect(JSON.stringify(state.snapshot)).toBe(before); });
  it('never infers a missing historical variant from the first current variant', () => { const state=commerce(); delete state.snapshot.orders[0].lines[0].variantId; expect(()=>decodeSnapshot(JSON.stringify(state.snapshot))).toThrow('históricas'); });
  it('keeps unknown currencies closed and blocks pending payment writes', () => { const state=commerce(); state.add('cliente','DEMO-001',1); const order=state.checkout('cliente','currency','address-cliente',DemoScenario.Pending); order.lines[0].currency=DemoCurrency.Unknown; const restored=new DemoCommerce(decodeSnapshot(JSON.stringify(state.snapshot))); expect(restored.snapshot.orders.at(-1)!.lines[0].currency).toBe(DemoCurrency.Unknown); expect(()=>restored.resolvePayment(order.id,DemoScenario.Approved)).toThrow('moneda'); });
});
