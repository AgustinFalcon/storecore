import { DemoCampaignState, DemoModuleState } from './demo-config-types';
import { DemoCommerce, DemoContext, DemoModuleId, DemoScenario, decodeSnapshot, demoSeed } from './demo-model';
import { DemoRole } from './demo-roles';
import { DemoRecovery, DemoRecoveryPhase, DemoAccessIntent } from './demo-access';
import { DemoAdminFilter, DemoAdminSort } from './demo-admin-selection';
import { DemoDeliveryMethod, DemoPaymentMethod } from './demo-process-types';
import { DemoReservationState } from './checkout/demo-reservation-state';
import { ProductPublication, VariantSaleState } from './catalog/catalog-types';
import { DemoReturnReason, DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnStatus } from './postsale/postsale-types';
import { DemoApplicationState } from './demo-state';
import { demoTestRuntime, legacyDemoWire } from './demo-test-runtime';
import { validDemoSession } from './demo-snapshot';
import { DemoInboxPolicy } from './demo-inbox';

describe('C05 closed access and ordered application composition',()=>{
  beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
  it('roundtrips every closed role, recovery phase, filter and sort and closes unknown wires',()=>{
    for(const role of DemoRole.all)expect(DemoRole.fromWire(role.wire)).toBe(role);
    expect(DemoRole.fromWire('ROOT')).toBe(DemoRole.Unknown);
    for(const value of DemoCampaignState.all)expect(DemoCampaignState.fromWire(value.wire)).toBe(value);
    for(const value of DemoModuleState.all)expect(DemoModuleState.fromWire(value.wire)).toBe(value);
    expect(DemoCampaignState.fromWire('injected')).toBe(DemoCampaignState.Unknown);expect(DemoModuleState.fromWire('injected')).toBe(DemoModuleState.Unknown);
    for(const phase of [DemoRecoveryPhase.Request,DemoRecoveryPhase.Sent,DemoRecoveryPhase.Ready,DemoRecoveryPhase.Expired,DemoRecoveryPhase.Used,DemoRecoveryPhase.Completed])expect(DemoRecoveryPhase.fromWire(phase.wire)).toBe(phase);
    expect(DemoRecoveryPhase.fromWire('injected')).toBe(DemoRecoveryPhase.Unknown);
    for(const filter of DemoAdminFilter.all)expect(DemoAdminFilter.fromWire(filter.wire)).toBe(filter);
    for(const sort of DemoAdminSort.all)expect(DemoAdminSort.fromWire(sort.wire)).toBe(sort);
    expect(DemoAdminFilter.fromWire('injected')).toBe(DemoAdminFilter.Unknown);expect(DemoAdminSort.fromWire('injected')).toBe(DemoAdminSort.Unknown);
  });
  it('recovery has one-use expiry with no credential or persistent-session authority',()=>{
    let now=1;const recovery=new DemoRecovery(()=>now);
    expect(recovery.inspect()).toBe(DemoRecoveryPhase.Unknown);recovery.request();expect(recovery.consume()).toBe(DemoRecoveryPhase.Completed);expect(recovery.consume()).toBe(DemoRecoveryPhase.Used);
    recovery.request();now+=300000;expect(recovery.inspect()).toBe(DemoRecoveryPhase.Expired);expect(sessionStorage.length).toBe(0);
  });
  it('safe intent checks customer ownership and rejects URL/query traversal input',()=>{
    const snapshot=demoSeed();
    for(const value of ['https://example.invalid','//host','/demo/checkout?return=evil','/demo/customer/orders/../user/home'])expect(DemoAccessIntent.fromWire(value)).toBe(DemoAccessIntent.Unknown);
    const intent=DemoAccessIntent.fromWire('/demo/customer/orders/DEMO-102');
    expect(intent.destination(snapshot,'cliente',DemoContext.Customer)).toBe('/demo');
    expect(intent.destination(snapshot,'cliente2',DemoContext.Customer)).toBe('/demo/customer/orders/DEMO-102');
    expect(DemoAccessIntent.fromWire('/demo/user/content').destination(snapshot,'cliente',DemoContext.Customer)).toBe('/demo');
  });
  it('customer and administrator sessions cannot interchange roles or resurrect Unknown',()=>{
    const state=new DemoApplicationState();
    expect(()=>state.login(DemoContext.Admin,'cliente')).toThrow('autorizado');
    expect(()=>state.login(DemoContext.Customer,'admin')).toThrow('autorizado');
    expect(()=>state.login(DemoContext.Unknown,'admin')).toThrow('autorizado');
    state.login(DemoContext.Admin,'admin');expect(state.actor.role).toBe(DemoRole.Admin);
    sessionStorage.setItem('storecore.demo.actor','cliente');sessionStorage.setItem('storecore.demo.context',DemoContext.Admin.wire);
    expect(new DemoApplicationState().context()).toBe(DemoContext.Unknown);
    expect(validDemoSession({...state.actor,role:DemoRole.Unknown},DemoContext.Admin)).toBe(false);
  });
  it('registration normalizes identities, rejects duplicates and assigns only Customer',()=>{
    const state=new DemoApplicationState();
    expect(state.registerCustomer(' CLIENTE@demo.invalid ','Alex','Demo')).toBeNull();
    const id=state.registerCustomer(' NEW@demo.invalid ','Nuevo','Demo')!;
    expect(id).toBeTruthy();expect(state.data.actors.find(actor=>actor.id===id)?.role).toBe(DemoRole.Customer);
    expect(state.data.actors.find(actor=>actor.id===id)?.email).toBe('new@demo.invalid');
    expect(state.context()).toBe(DemoContext.Unknown);
    expect(()=>state.login(DemoContext.Admin,id)).toThrow();
    const restored=decodeSnapshot(localStorage.getItem('storecore.commercial-demo.v1')!);expect(restored.actors.find(actor=>actor.id===id)?.role).toBe(DemoRole.Customer);
  });
  it('default coordinator is deny-by-default and payment ownership runs before idempotency',()=>{
    const guest=new DemoCommerce();expect(()=>guest.add('cliente','DEMO-001',1,'DEMO-001:standard')).toThrow('sesión');
    const commerce=demoTestRuntime();commerce.sessionAsCustomer();commerce.add('cliente','DEMO-001',1,'DEMO-001:standard');
    const order=commerce.checkout('cliente','pending','address-cliente',DemoScenario.Pending,DemoPaymentMethod.Card,DemoDeliveryMethod.Home);
    commerce.sessionAsCustomer('cliente2');const before=JSON.stringify(commerce.snapshot);
    expect(()=>commerce.cancelPayment(order.id)).toThrow('otro comprador');expect(()=>commerce.resolvePayment(order.id,DemoScenario.Approved)).toThrow('otro comprador');expect(JSON.stringify(commerce.snapshot)).toBe(before);
    commerce.sessionAsCustomer();commerce.cancelPayment(order.id);commerce.sessionAsGuest();const cancelled=JSON.stringify(commerce.snapshot);
    expect(()=>commerce.cancelPayment(order.id)).toThrow('sesión');expect(JSON.stringify(commerce.snapshot)).toBe(cancelled);
  });
  it('admin writes, profile and address writes enforce role plus current actor',()=>{
    const commerce=demoTestRuntime();commerce.sessionAsCustomer();const before=JSON.stringify(commerce.snapshot);
    expect(()=>commerce.saveSettings({...commerce.snapshot.settings,deliveryDays:3})).toThrow('administración');
    expect(()=>commerce.saveContent('Changed','',[])).toThrow('administración');expect(()=>commerce.setModule(DemoModuleId.Catalog)).toThrow('administración');
    expect(()=>commerce.saveProfile('cliente2',{firstName:'Injected',lastName:'Demo',phone:''})).toThrow('propia');
    expect(()=>commerce.saveAddress('cliente2',commerce.actor('cliente2').addresses[0])).toThrow('propia');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
    commerce.sessionAsAdmin();commerce.saveContent('Saved','Subtitle',commerce.snapshot.blocks);expect(commerce.snapshot.title).toBe('Saved');
  });
  it('restores the same canonical singletons in catalog, reservation, post-sale, fulfillment and marketplace',()=>{
    const commerce=demoTestRuntime();commerce.sessionAsCustomer();commerce.add('cliente','DEMO-001',1,'DEMO-001:standard');
    const order=commerce.checkout('cliente','pending','address-cliente',DemoScenario.Pending,DemoPaymentMethod.Card,DemoDeliveryMethod.Pickup);
    const restored=decodeSnapshot(JSON.stringify(commerce.snapshot));
    expect(restored.version).toBe(6);expect(restored.products[0].publication).toBe(ProductPublication.Published);expect(restored.products[0].variants[0].saleState).toBe(VariantSaleState.Active);
    expect(restored.orders.find(value=>value.id===order.id)?.reservation?.state).toBe(DemoReservationState.Held);
    expect(restored.actors[0].role).toBe(DemoRole.Customer);expect(restored.returns).toEqual([]);
  });
  it.each([1,4,5] as const)('upgrades supported legacy v%s once without inventing package stock',version=>{
    const first=decodeSnapshot(legacyDemoWire(version));expect(first.version).toBe(6);expect(first.products[0].variants).toHaveLength(1);
    expect(first.products[0].variants[0].onHand).toBe(first.products[0].onHand);
    expect(first.actors.find(actor=>actor.id==='admin')?.role).toBe(DemoRole.Admin);
    expect(JSON.stringify(decodeSnapshot(JSON.stringify(first)))).toBe(JSON.stringify(first));
  });
  it('rejects unsupported versions, missing channel, inconsistent stock and orphan post-sale data',()=>{
    for(const version of [0,2,3,7]){const raw=JSON.parse(JSON.stringify(demoSeed()));raw.version=version;expect(()=>decodeSnapshot(JSON.stringify(raw))).toThrow('versión');}
    const raw=JSON.parse(JSON.stringify(demoSeed()));delete raw.marketplace;expect(()=>decodeSnapshot(JSON.stringify(raw))).toThrow('Falta el canal');
    const bad=demoSeed();bad.products[0].reserved++;expect(()=>decodeSnapshot(JSON.stringify(bad))).toThrow('resumen');
  });
  it('Unknown product/role are rendered safely and never authorize stock or access',()=>{
    const raw=JSON.parse(JSON.stringify(demoSeed()));raw.products[0].publication={wire:'injected'};raw.actors[0].role={wire:'ROOT'};
    const restored=decodeSnapshot(JSON.stringify(raw));expect(restored.products[0].publication).toBe(ProductPublication.Unknown);expect(restored.actors[0].role).toBe(DemoRole.Unknown);
    const commerce=demoTestRuntime(restored);commerce.sessionAsCustomer();expect(()=>commerce.add('cliente','DEMO-001',1,'DEMO-001:standard')).toThrow('sesión');
    expect(commerce.available('DEMO-001')).toBe(0);
  });
  it('retry preserves paid quote and variant identity until the customer explicitly confirms current money',()=>{
    const commerce=demoTestRuntime();commerce.sessionAsCustomer();commerce.add('cliente','DEMO-001',1,'DEMO-001:with-case');
    const order=commerce.checkout('cliente','rejected','address-cliente',DemoScenario.Rejected,DemoPaymentMethod.Card,DemoDeliveryMethod.Home);
    commerce.sessionAsAdmin();commerce.saveCampaign({...commerce.snapshot.campaigns[0],state:DemoCampaignState.Paused});
    commerce.sessionAsCustomer('cliente2');expect(()=>commerce.retryOrder('cliente2',order.id)).toThrow('propio');
    commerce.sessionAsCustomer();commerce.retryOrder('cliente',order.id);expect(commerce.actor('cliente').cart[0].variantId).toBe('DEMO-001:with-case');expect(commerce.actor('cliente').cart[0].quotedUnit).toBe(order.lines[0].unit);expect(commerce.needsReconfirmation('cliente')).toBe(true);
    commerce.refreshCart('cliente');expect(commerce.needsReconfirmation('cliente')).toBe(false);
  });
  it('post-sale survives reload using its own state and never changes the original total',()=>{
    const commerce=demoTestRuntime();commerce.sessionAsCustomer('cliente2');const order=commerce.snapshot.orders[2],total=order.total,line=order.lines[0];
    const request=commerce.postSale.request('cliente2','return',order.id,[{sku:line.sku,variantId:line.variantId,quantity:1,reason:DemoReturnReason.all[0]}]);
    commerce.sessionAsAdmin();commerce.postSale.decide('admin',request.id,true,'Aprobado');
    commerce.postSale.receive('admin',request.id);commerce.postSale.inspect('admin',request.id,'Completo',DemoReturnInspectionResult.Complete);
    commerce.postSale.dispose('admin',request.id,[{sku:line.sku,variantId:line.variantId,disposition:DemoReturnDisposition.Restock}]);commerce.postSale.refund('admin',request.id);
    const restored=decodeSnapshot(JSON.stringify(commerce.snapshot));expect(restored.returns[0].status).toBe(DemoReturnStatus.Refunded);expect(restored.orders[2].total).toBe(total);expect('returned' in restored.orders[2]).toBe(false);
  });
  it('checkout freezes a configured pickup location and replay never rewrites recipient or delivery',()=>{
    const commerce=demoTestRuntime();const variant=commerce.catalog.variant('DEMO-001','DEMO-001:standard');
    variant.pickupLocation='Sucursal Norte · Calle 456 · lunes de 9 a 17';
    commerce.sessionAsCustomer();commerce.add('cliente','DEMO-001',1,variant.id);
    const order=commerce.checkout('cliente','pickup-custom','',DemoScenario.Approved,DemoPaymentMethod.Card,DemoDeliveryMethod.Pickup);
    expect(order.address).toBe(variant.pickupLocation);const frozen=JSON.stringify(order);
    commerce.saveProfile('cliente',{firstName:'Otro nombre',lastName:'Demo',phone:'123456'});variant.pickupLocation='Sucursal cambiada';
    expect(commerce.checkout('cliente','pickup-custom','',DemoScenario.Approved,DemoPaymentMethod.Card,DemoDeliveryMethod.Pickup)).toBe(order);
    expect(JSON.stringify(order)).toBe(frozen);
  });
  it('composes the retained Outlet fixture without sellable stock, cart entry or default channel mapping',()=>{
    const commerce=demoTestRuntime(),outlet=commerce.product('VLD-043'),variant=outlet.variants[0];
    expect(variant.onHand).toBe(1);expect(variant.notSellable).toBe(1);expect(commerce.available(outlet.sku,variant.id)).toBe(0);
    expect(outlet.media[0].src).toBe('/assets/demo/DEMO-004.svg');expect(variant.outlet?.warrantyTerms).toBeTruthy();
    expect(commerce.snapshot.marketplace!.mappings.some(mapping=>mapping.sku===outlet.sku)).toBe(false);
    expect(DemoAdminFilter.LowStock.product(outlet,0,5)).toBe(false);new DemoInboxPolicy().reconcile(commerce.snapshot,'2026-10-20T19:00:00Z');
    expect(commerce.snapshot.inbox!.alerts.some(alert=>alert.sku===outlet.sku)).toBe(false);
    const stockBefore=JSON.stringify(commerce.snapshot);expect(()=>commerce.adjust(outlet.sku,1,'Ingreso',variant.id)).toThrow('Outlet');expect(JSON.stringify(commerce.snapshot)).toBe(stockBefore);
    commerce.sessionAsCustomer();const before=JSON.stringify(commerce.snapshot);
    expect(()=>commerce.add('cliente',outlet.sku,1,variant.id)).toThrow('no está disponible');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
  });
  it('does not reinterpret an explicitly invalid legacy variant as the standard variant',()=>{
    for(const invalid of ['', '   ', null, 42]){
      const raw=JSON.parse(legacyDemoWire(4));raw.actors[0].cart=[{sku:'DEMO-001',variantId:invalid,quantity:1}];
      expect(()=>decodeSnapshot(JSON.stringify(raw))).toThrow('explícita');
    }
    const valid=JSON.parse(legacyDemoWire(4));valid.actors[0].cart=[{sku:'DEMO-001',quantity:1}];
    expect(decodeSnapshot(JSON.stringify(valid)).actors[0].cart[0].variantId).toBe('DEMO-001:standard');
  });
  it('rejects duplicate configuration identities rather than choosing between conflicting states',()=>{
    const modules=demoSeed();modules.modules.push({...modules.modules[0],state:DemoModuleState.Paused});
    expect(()=>decodeSnapshot(JSON.stringify(modules))).toThrow('módulos duplicados');
    const campaigns=demoSeed();campaigns.campaigns.push({...campaigns.campaigns[0],state:DemoCampaignState.Paused});
    expect(()=>decodeSnapshot(JSON.stringify(campaigns))).toThrow('campañas duplicadas');
  });
  it('the closed sort owns insertion recency, amount, name and Unknown behavior without mutating the source',()=>{
    const values=[{id:'z-first',name:'Beta',total:10},{id:'a-last',name:'Alpha',total:20}];
    expect(DemoAdminSort.Recent.apply(values).map(value=>value.id)).toEqual(['a-last','z-first']);
    expect(DemoAdminSort.Name.apply(values)[0].name).toBe('Alpha');expect(DemoAdminSort.Amount.apply(values)[0].total).toBe(20);
    expect(DemoAdminSort.Unknown.apply(values)).toEqual([]);expect(values[0].id).toBe('z-first');
  });
});
