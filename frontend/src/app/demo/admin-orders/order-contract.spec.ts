import {DemoCommerce,DemoContext,DemoScenario,demoSeed,demoSeedV7,decodeSnapshot,type DemoSnapshot,type DemoOrder} from '../demo-model';
import {DemoProductVariant} from '../catalog/product-variant';
import {CustomerAccountState} from '../customers/customer-account';
import {DemoDeliveryMethod} from '../demo-process-types';
import {IncidentReason,IncidentStatus,ReturnStage,RefundStatus} from '../aftercare/aftercare-types';
import {PaymentStatus,OrderStatus,ShipmentStatus} from '../../domain/order/commerce-states';
import {UserRole} from '../../domain/user/user-role';
import {DemoSnapshotPersistence} from '../demo-snapshot-persistence';
import {MigrateOrdersV7ToV8Step} from './order-migration';
import {DemoPickupStage,DemoHistoricalVariant,DemoIncidentState,DemoIncidentProjectionStep,DemoFulfillmentState,DemoAftercareState,DemoOrderScope,DemoOrderOperations} from './order-types';
import {ShipDemoOrderStep,DeliverDemoOrderStep,CollectDemoPickupStep,type OrderAuthority,type OrderIntent,type DemoOrderCommand} from './order-flow';
import {OrderQueueAxis,OrderQueueFilter,OrderQueueQuery,ExportDemoOrdersStep} from './order-query';

const authority:OrderAuthority={context:DemoContext.Admin,role:UserRole.Admin,actor:'cliente',epoch:1,readable:true};
const order=(snapshot:DemoSnapshot,id:string)=>snapshot.orders.find(row=>row.id===id)!;
const intent=(snapshot:DemoSnapshot,id:string,tracking=order(snapshot,id).tracking):OrderIntent=>({id,actor:authority.actor,epoch:authority.epoch,revision:snapshot.revision,fingerprint:JSON.stringify(order(snapshot,id)),tracking});
const incident=(snapshot:DemoSnapshot,id:string,status:IncidentStatus)=>({id:'case-'+id,orderId:id,actorId:order(snapshot,id).actor,reason:IncidentReason.Delivery,status,message:'Consulta',date:'2026-10-15'});
const csv='id,payment,shipment,total,incident\nORD-1012,PENDING,PENDING,198800,NONE\nORD-1019,APPROVED,SHIPPED,198800,OPEN';

describe('SC20 V8 migration contract',()=>{
 afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
 it('roundtrips authentic V7 to V8 twice, preserving legacy and SC19 aftercare bytes',()=>{
  const previous=demoSeedV7(),legacy=JSON.stringify(previous.orders.filter(row=>row.id.startsWith('DEMO-'))),existing=JSON.stringify(order(previous,'ORD-1015')),returns=JSON.stringify(previous.aftercare.returns),stock=previous.products.find(row=>row.sku==='DEMO-001')!;
  const next=decodeSnapshot(JSON.stringify(previous));
  expect(next.version).toBe(9);expect(JSON.stringify(next.orders.filter(row=>row.id.startsWith('DEMO-')))).toBe(legacy);
  expect(JSON.stringify(order(next,'ORD-1015'))).toBe(existing);
  expect(JSON.stringify(next.aftercare.returns.filter(row=>row.orderId==='ORD-1015'))).toBe(returns);
  expect(next.orders.filter(row=>DemoOrderScope.includes(row.id)).map(row=>row.id).sort()).toEqual([...DemoOrderScope.ids].sort());
  expect(next.actors.filter(row=>row.id.startsWith('buyer-'))).toHaveLength(11);
  for(const actor of next.actors.filter(row=>row.id.startsWith('buyer-'))){expect(actor.access?.state).toBe(CustomerAccountState.Active);expect([actor.cart,actor.favorites,actor.phone]).toEqual([[],[],'']);}
  expect(next.products.find(row=>row.sku==='DEMO-001')).toMatchObject({onHand:stock.onHand,reserved:stock.reserved+1});
  const raw=JSON.stringify(next);expect(JSON.stringify(decodeSnapshot(raw))).toBe(raw);
 });
 it('preserves an existing cart and Pending order and aggregates every reservation',()=>{
  const previous=demoSeedV7(),product=previous.products.find(row=>row.sku==='DEMO-001')!,actor=previous.actors[0];
  actor.cart.push({sku:product.sku,quantity:2,variant:DemoProductVariant.Standard});
  previous.orders.push({...previous.orders[0],id:'OWNER-PENDING',actor:actor.id,payment:PaymentStatus.Pending,status:OrderStatus.PendingPayment,shipment:ShipmentStatus.Pending,lines:[{sku:product.sku,name:product.name,quantity:2,unit:product.price,variant:DemoProductVariant.Standard}],total:product.price*2});product.reserved+=2;
  const before=JSON.stringify([actor.cart,order(previous,'OWNER-PENDING')]),next=decodeSnapshot(JSON.stringify(previous)),preserved={...order(next,'OWNER-PENDING')};delete preserved.pickupStage;delete preserved.incidentStatus;
  expect(JSON.stringify([next.actors[0].cart,preserved])).toBe(before);
  expect(next.products.find(row=>row.sku===product.sku)!.reserved).toBe(product.reserved+1);
 });
 it('rolls back unavailable stock byte-exact without replacing durable V7 or mutating its input',()=>{
  const previous=demoSeedV7(),product=previous.products.find(row=>row.sku==='DEMO-001')!;product.onHand=product.reserved;
  const raw=JSON.stringify(previous);localStorage.setItem(DemoSnapshotPersistence.key,raw);
  expect(()=>new MigrateOrdersV7ToV8Step().execute(previous)).toThrow();expect(JSON.stringify(previous)).toBe(raw);
  expect(()=>new DemoSnapshotPersistence(localStorage,()=>{}).load(previous)).toThrow();expect(localStorage.getItem(DemoSnapshotPersistence.key)).toBe(raw);
 });
 it('rejects invalid V7 reservations before inserting any canonical order',()=>{
  const previous=demoSeedV7();previous.products.find(row=>row.sku==='DEMO-001')!.reserved++;
  expect(()=>decodeSnapshot(JSON.stringify(previous))).toThrow('reservas');
 });
 it('rejects actor/email/SKU/order/aftercare collisions atomically',()=>{
  const changes:((snapshot:DemoSnapshot)=>void)[]=[
   s=>s.actors.push({...s.actors[0],id:'buyer-ord-1012',email:'other@demo.invalid'}),
   s=>s.actors.push({...s.actors[0],id:'email-collision',email:' MICA@demo.invalid '}),
   s=>s.products.push({...s.products[0],sku:'LMP-044',price:1}),
   s=>{s.products.find(row=>row.sku==='VLD-043')!.price=1;},
   s=>s.orders.push({...s.orders[0],id:'ORD-1013'}),
   s=>s.aftercare.returns.push({...s.aftercare.returns[0],id:'RETURN-1021-1'}),
  ];
  for(const change of changes){const previous=demoSeedV7();change(previous);const before=JSON.stringify(previous);expect(()=>new MigrateOrdersV7ToV8Step().execute(previous)).toThrow();expect(JSON.stringify(previous)).toBe(before);}
 });
 it('keeps historical variants separate from buyable variants and creates complete refunded ledger',()=>{
  const previous=demoSeedV7();previous.products=previous.products.filter(row=>!['LMP-044','VLD-043'].includes(row.sku));previous.catalogDetails=previous.catalogDetails.filter(row=>!['LMP-044','VLD-043'].includes(row.sku));const snapshot=decodeSnapshot(JSON.stringify(previous));
  for(const id of ['ORD-1012','ORD-1016','ORD-1020','ORD-1021'])expect(order(snapshot,id).lines[0].variant).toBe(DemoProductVariant.Standard);
  expect(['ORD-1012','ORD-1016','ORD-1020','ORD-1021'].map(id=>order(snapshot,id).lines[0].historicalVariant)).toEqual([DemoHistoricalVariant.Kit,DemoHistoricalVariant.BareTool,DemoHistoricalVariant.Standard,DemoHistoricalVariant.OutletUnit01]);
  expect(snapshot.products.find(row=>row.sku==='LMP-044')?.active).toBe(false);expect(snapshot.products.find(row=>row.sku==='VLD-043')?.active).toBe(false);
  expect(snapshot.catalogDetails.find(row=>row.sku==='VLD-043')?.notSellable).toBe(1);
  const refund=snapshot.aftercare.returns.find(row=>row.id==='RETURN-1021-1')!;
  expect(refund.events.map(event=>event.stage)).toEqual([ReturnStage.Submitted,ReturnStage.Review,ReturnStage.Approved,ReturnStage.Received,ReturnStage.RefundPending,ReturnStage.Refunded]);
  expect(refund.events.every(event=>event.date==='2026-10-11')).toBe(true);expect(refund.refund).toEqual({status:RefundStatus.Refunded,amount:7190000});
 });
});

describe('SC20 closed projections and authority',()=>{
 it('closes every finite SC20 type and leaves the production pickup wire unsupported',()=>{
  for(const type of [DemoPickupStage,DemoHistoricalVariant,DemoIncidentState,DemoFulfillmentState,DemoAftercareState,OrderQueueAxis]){for(const value of type.all)expect(type.fromWire(value.wire)).toBe(value);for(const raw of [null,undefined,'future',0,false,{}])expect(type.fromWire(raw)).toBe(type.Unknown);}
  expect(ShipmentStatus.fromWire(DemoFulfillmentState.ReadyPickup.wire)).toBe(ShipmentStatus.Unknown);
  for(const axis of OrderQueueAxis.all){expect(OrderQueueFilter.fromWire(axis,'future').known).toBe(false);for(const value of axis.values)expect(OrderQueueFilter.fromWire(axis,value.wire).value).toBe(value);}
 });
 it('projects correlated incident precedence and observes subsequent aftercare changes',()=>{
  const snapshot=demoSeed(),row=order(snapshot,'ORD-1013'),project=new DemoIncidentProjectionStep();
  for(const own of [...DemoIncidentState.all,DemoIncidentState.Unknown])for(const status of [undefined,IncidentStatus.Submitted,IncidentStatus.Closed,IncidentStatus.Unknown]){
   row.incidentStatus=own;snapshot.aftercare.incidents=status?[incident(snapshot,row.id,status)]:[];
   const expected=own===DemoIncidentState.Unknown||status===IncidentStatus.Unknown?DemoIncidentState.Unknown:own===DemoIncidentState.Open||status===IncidentStatus.Submitted?DemoIncidentState.Open:own===DemoIncidentState.StockReview?own:own===DemoIncidentState.Resolved||status===IncidentStatus.Closed?DemoIncidentState.Resolved:DemoIncidentState.None;
   expect(project.execute(snapshot,row)).toBe(expected);
  }
  row.incidentStatus=DemoIncidentState.None;row.incident='legacy text';snapshot.aftercare.incidents=[incident(snapshot,'ORD-1019',IncidentStatus.Submitted)];expect(project.execute(snapshot,row)).toBe(DemoIncidentState.None);
  snapshot.aftercare.incidents=[incident(snapshot,row.id,IncidentStatus.Submitted)];expect(project.execute(snapshot,row)).toBe(DemoIncidentState.Open);snapshot.aftercare.incidents[0].status=IncidentStatus.Closed;expect(project.execute(snapshot,row)).toBe(DemoIncidentState.Resolved);
 });
 it('projects only coherent pickup combinations and never invents refunded evidence',()=>{
  const snapshot=demoSeed(),row=order(snapshot,'ORD-1017');expect(DemoFulfillmentState.project(row)).toBe(DemoFulfillmentState.ReadyPickup);expect(DemoFulfillmentState.project(order(snapshot,'ORD-1007'))).toBe(DemoFulfillmentState.Collected);
  for(const stage of [DemoPickupStage.None,DemoPickupStage.Collected,DemoPickupStage.Unknown]){row.pickupStage=stage;expect(DemoFulfillmentState.project(row)).toBe(DemoFulfillmentState.Unknown);}
  row.fulfillment=DemoDeliveryMethod.Home;row.pickupStage=DemoPickupStage.Ready;expect(DemoFulfillmentState.project(row)).toBe(DemoFulfillmentState.Unknown);
  expect(DemoAftercareState.label(snapshot,order(snapshot,'ORD-1015'))).toBe('1 reembolsada / 1 disponible');expect(DemoAftercareState.project(snapshot,order(snapshot,'ORD-1021'))).toBe(DemoAftercareState.Refunded);
  snapshot.aftercare.returns=snapshot.aftercare.returns.filter(record=>record.orderId!=='ORD-1021');expect(DemoAftercareState.project(snapshot,order(snapshot,'ORD-1021'))).toBe(DemoAftercareState.Unknown);
 });
 it('decodes future V8 wires at the boundary into readonly closed cases',()=>{
  for(const field of ['pickupStage','incidentStatus'] as const){const raw=JSON.parse(JSON.stringify(demoSeed()));raw.orders.find((row:DemoOrder)=>row.id==='ORD-1013')[field]={wire:'future'};const restored=decodeSnapshot(JSON.stringify(raw)),row=order(restored,'ORD-1013');expect(row[field]).toBe(field==='pickupStage'?DemoPickupStage.Unknown:DemoIncidentState.Unknown);expect(new ShipDemoOrderStep().permits(restored,row)).toBe(false);expect(JSON.stringify(decodeSnapshot(JSON.stringify(restored)))).toBe(JSON.stringify(restored));}
  const snapshot=demoSeed(),refund=snapshot.aftercare.returns.find(row=>row.orderId==='ORD-1021')!;refund.stage=ReturnStage.Unknown;refund.events.at(-1)!.stage=ReturnStage.Unknown;const restored=decodeSnapshot(JSON.stringify(snapshot));expect(DemoAftercareState.project(restored,order(restored,'ORD-1021'))).toBe(DemoAftercareState.Unknown);
 });
 it('authorizes before touching private aggregates for query, export and commands',()=>{
  const snapshot=demoSeed();for(const key of ['orders','actors','aftercare'])Object.defineProperty(snapshot,key,{get:()=>{throw Error('private read');}});
  for(const denied of [{...authority,context:DemoContext.Customer},{...authority,context:DemoContext.Unknown},{...authority,role:UserRole.Unknown},{...authority,readable:false}]){
   expect(()=>OrderQueueQuery.fromWire({}).execute(snapshot,denied)).toThrow('Acceso denegado');expect(()=>new ExportDemoOrdersStep().execute(snapshot,denied,new Set())).toThrow('Acceso denegado');
   expect(()=>new ShipDemoOrderStep().execute(snapshot,denied,{id:'ORD-1013',actor:'cliente',epoch:1,revision:0,fingerprint:'',tracking:'manual'})).toThrow('Acceso denegado');
  }
 });
 it('filters twelve canonical orders deterministically and exports hidden authorized selections exactly',()=>{
  const snapshot=demoSeed();for(const role of [UserRole.Admin,UserRole.Operator])expect(OrderQueueQuery.fromWire({}).execute(snapshot,{...authority,role})).toHaveLength(12);
  expect(OrderQueueQuery.fromWire({payment:PaymentStatus.Pending.wire}).execute(snapshot,authority).map(row=>row.id)).toEqual(['ORD-1012']);
  expect(OrderQueueQuery.fromWire({incident:DemoIncidentState.Open.wire}).execute(snapshot,authority).map(row=>row.id)).toEqual(['ORD-1019']);
  expect(OrderQueueQuery.fromWire({payment:PaymentStatus.Pending.wire,fulfillment:DemoFulfillmentState.Shipped.wire}).execute(snapshot,authority)).toEqual([]);
  const query=OrderQueueQuery.fromWire({q:'Nora',modality:DemoDeliveryMethod.Home.wire});expect(OrderQueueQuery.fromWire(query.params)).toEqual(query);expect(query.execute(snapshot,authority).map(row=>row.id)).toEqual(['ORD-1014']);
  expect(OrderQueueQuery.fromWire({payment:'future'}).known).toBe(false);
  expect(new ExportDemoOrdersStep().execute(snapshot,authority,new Set(['ORD-1012','ORD-1019','DEMO-1001','foreign']))).toBe(csv);
 });
});

describe('SC20 unit commands',()=>{
 it('classifies absent legacy incident state once, roundtrips, filters and exports the closed result',()=>{for(const selectedId of ['ORD-1015','DEMO-100']){const previous=demoSeedV7(),original=order(previous,selectedId);original.incident='Consulta de muestra';const facts=JSON.stringify({...original,incidentStatus:null}),ledger=JSON.stringify(previous.aftercare.returns);const decoded=decodeSnapshot(JSON.stringify(previous)),row=order(decoded,selectedId);expect(row.incidentStatus).toBe(DemoIncidentState.Open);expect(JSON.stringify({...row,incidentStatus:null})).toBe(facts);expect(JSON.stringify(decoded.aftercare.returns.filter(record=>record.orderId==='ORD-1015'))).toBe(ledger);const raw=JSON.stringify(decoded);expect(JSON.stringify(decodeSnapshot(raw))).toBe(raw);expect(new DemoIncidentProjectionStep().execute(decoded,row)).toBe(DemoIncidentState.Open);if(DemoOrderOperations.fromWire(row)===DemoOrderOperations.Queue){expect(OrderQueueQuery.fromWire({incident:DemoIncidentState.Open.wire}).execute(decoded,authority)).toContain(row);expect(new ExportDemoOrdersStep().execute(decoded,authority,new Set([row.id]))).toContain(row.id+',APPROVED,DELIVERED,169000,OPEN');expect(DemoFulfillmentState.project(row)).toBe(DemoFulfillmentState.Delivered);}delete row.incident;expect(new DemoIncidentProjectionStep().execute(decoded,row)).toBe(DemoIncidentState.Open);row.incidentStatus=DemoIncidentState.Unknown;const unknown=decodeSnapshot(JSON.stringify(decoded));expect(new DemoIncidentProjectionStep().execute(unknown,order(unknown,row.id))).toBe(DemoIncidentState.Unknown);}});
 it('derives the closed operations capability at its single scope mapping and refuses every legacy bypass for queue orders',()=>{for(const capability of DemoOrderOperations.all)expect(DemoOrderOperations.fromWire(capability.wire)).toBe(capability);for(const value of [null,undefined,'future',0,{},false,{id:''}])expect(DemoOrderOperations.fromWire(value)).toBe(DemoOrderOperations.Unknown);const commerce=new DemoCommerce(demoSeed());for(const id of DemoOrderScope.ids){const row=order(commerce.snapshot,id),before=JSON.stringify(commerce.snapshot);expect(DemoOrderOperations.fromWire(row)).toBe(DemoOrderOperations.Queue);for(const mutate of [()=>commerce.advance(id),()=>commerce.receiveReturn(id),()=>commerce.resolvePayment(id,DemoScenario.Approved),()=>commerce.cancelPayment(id),()=>commerce.reportIncident(id,'Consulta'),()=>commerce.resolveIncident(id)]){expect(mutate).toThrow('cola operativa');expect(JSON.stringify(commerce.snapshot)).toBe(before);}}const legacy=order(commerce.snapshot,'DEMO-100');expect(DemoOrderOperations.fromWire(legacy)).toBe(DemoOrderOperations.Legacy);commerce.advance(legacy.id);expect(legacy.shipment).toBe(ShipmentStatus.Shipped);commerce.receiveReturn('DEMO-102');expect(order(commerce.snapshot,'DEMO-102').returned).toBe(true);});
 const cases:readonly [string,DemoOrderCommand,ShipmentStatus,DemoPickupStage][]=[['ORD-1013',new ShipDemoOrderStep(),ShipmentStatus.Shipped,DemoPickupStage.None],['ORD-1014',new DeliverDemoOrderStep(),ShipmentStatus.Delivered,DemoPickupStage.None],['ORD-1017',new CollectDemoPickupStep(),ShipmentStatus.Delivered,DemoPickupStage.Collected]];
 it('applies each exact unit effect, preserves unrelated bytes and repeats without revision or history',()=>{
  for(const [id,command,target,pickup] of cases){const snapshot=demoSeed(),row=order(snapshot,id),proposal=intent(snapshot,id,command.requiresTracking?' MANUAL-123 ':row.tracking),before=JSON.stringify({...snapshot,revision:0,orders:snapshot.orders.filter(value=>value.id!==id)}),facts=JSON.stringify({...row,shipment:null,pickupStage:null,tracking:null,history:null}),history=[...row.history];
   expect(command.execute(snapshot,authority,proposal)).toBe(true);expect(row.shipment).toBe(target);expect(row.pickupStage).toBe(pickup);expect(row.tracking).toBe(proposal.tracking.trim());expect(row.history).toEqual([...history,command.label+' · simulación']);
   expect(JSON.stringify({...snapshot,revision:0,orders:snapshot.orders.filter(value=>value.id!==id)})).toBe(before);expect(JSON.stringify({...row,shipment:null,pickupStage:null,tracking:null,history:null})).toBe(facts);
   const applied=JSON.stringify(snapshot);expect(command.execute(snapshot,authority,proposal)).toBe(false);expect(JSON.stringify(snapshot)).toBe(applied);expect(()=>decodeSnapshot(applied)).not.toThrow();
  }
 });
 it('rejects stale identity/epoch/revision/facts and changed target tracking without overwriting proposals',()=>{
  for(const patch of [{actor:'other'},{epoch:2},{revision:-1},{fingerprint:'stale'}]){const snapshot=demoSeed(),proposal={...intent(snapshot,'ORD-1013','TRACK-1'),...patch},before=JSON.stringify(snapshot);expect(()=>new ShipDemoOrderStep().execute(snapshot,authority,proposal)).toThrow();expect(JSON.stringify(snapshot)).toBe(before);}
  const snapshot=demoSeed(),proposal=intent(snapshot,'ORD-1013','TRACK-1'),command=new ShipDemoOrderStep();command.execute(snapshot,authority,proposal);const applied=JSON.stringify(snapshot);expect(()=>command.execute(snapshot,authority,{...proposal,tracking:'TRACK-2'})).toThrow('Conflicto');expect(JSON.stringify(snapshot)).toBe(applied);
 });
 it('blocks Unknown on every axis, open/stock incidents, contradictions and active returns',()=>{
  const patches:Partial<DemoOrder>[]=[{payment:PaymentStatus.Unknown},{status:OrderStatus.Unknown},{shipment:ShipmentStatus.Unknown},{fulfillment:DemoDeliveryMethod.Unknown},{pickupStage:DemoPickupStage.Unknown},{incidentStatus:DemoIncidentState.Unknown},{status:OrderStatus.PaidStockReview},{status:OrderStatus.Cancelled},{incidentStatus:DemoIncidentState.Open},{incidentStatus:DemoIncidentState.StockReview}];
  for(const [id,command] of cases)for(const patch of patches){const snapshot=demoSeed(),row=order(snapshot,id);Object.assign(row,patch);const before=JSON.stringify(snapshot);expect(command.permits(snapshot,row)).toBe(false);expect(()=>command.execute(snapshot,authority,intent(snapshot,id,'MANUAL'))).toThrow();expect(JSON.stringify(snapshot)).toBe(before);}
  const snapshot=demoSeed(),row=order(snapshot,'ORD-1013');snapshot.aftercare.returns.push({...snapshot.aftercare.returns[0],id:'active',orderId:row.id,actorId:row.actor,stage:ReturnStage.Submitted});expect(new ShipDemoOrderStep().permits(snapshot,row)).toBe(false);
  expect(new DeliverDemoOrderStep().permits(snapshot,order(snapshot,'ORD-1019'))).toBe(false);
 });
 it('requires real manual tracking and refuses tracking on pickup',()=>{
  const snapshot=demoSeed();expect(()=>new ShipDemoOrderStep().execute(snapshot,authority,intent(snapshot,'ORD-1013','  '))).toThrow('tracking');order(snapshot,'ORD-1017').tracking='contradiction';expect(new CollectDemoPickupStep().permits(snapshot,order(snapshot,'ORD-1017'))).toBe(false);
 });
 it('blocks unknown or missing historical line evidence for every unit command',()=>{
  for(const [id,command] of cases)for(const change of [(row:DemoOrder)=>{row.lines[0].variant=DemoProductVariant.Unknown;},(row:DemoOrder)=>{row.lines[0].historicalVariant=DemoHistoricalVariant.Unknown;},(row:DemoOrder)=>{delete row.lines[0].historicalVariant;}]){const snapshot=demoSeed(),row=order(snapshot,id);change(row);const before=JSON.stringify(snapshot);expect(command.permits(snapshot,row)).toBe(false);expect(()=>command.execute(snapshot,authority,intent(snapshot,id,'MANUAL'))).toThrow();expect(JSON.stringify(snapshot)).toBe(before);}
 });
});
