import type {DemoSnapshot,DemoOrder,DemoProduct} from '../demo-model';
import {DemoProductVariant} from '../catalog/product-variant';
import {CustomerAccountState} from '../customers/customer-account';
import {OrderStatus,PaymentStatus,ShipmentStatus} from '../../domain/order/commerce-states';
import {DemoDeliveryMethod} from '../demo-process-types';
import {MigrateCatalogV4ToV5Step,CatalogDetailsPolicy} from '../rich-catalog/catalog-details';
import {CatalogProductPolicy} from '../admin-catalog/catalog-policy';
import {ProductCondition,OutletScope} from '../catalog/catalog-types';
import {ItemCondition} from '../rich-catalog/catalog-details-types';
import {ReturnStage,ReturnOutcome,ReturnReason,RefundStatus} from '../aftercare/aftercare-types';
import {AftercareCodec} from '../aftercare/aftercare-ledger';
import {DemoHistoricalVariant as Variant,DemoPickupStage as Pickup,DemoIncidentState as Incident,DemoOrderMetadataCodec,DemoOrderOrigin,DemoOrderScope} from './order-types';

// Immutable insertion facts, consumed once by V8. Runtime queue reads only snapshot.orders.
const fixtures=[
 ['1007','2025-02-18','Alex','Demo','alex','APPROVED','PAID','DELIVERED','pickup','DEMO-001',198800,'kit-completo'],
 ['1012','2026-10-15','Mica','Torres','mica','PENDING','PENDING_PAYMENT','PENDING','home','DEMO-001',198800,'kit-completo'],
 ['1013','2026-10-15','Leo','Ruiz','leo','APPROVED','PAID','PREPARING','home','DEMO-001',198800,'kit-completo'],
 ['1014','2026-10-14','Nora','Paz','nora','APPROVED','PAID','SHIPPED','home','LUM-042',84500,'standard'],
 ['1016','2026-10-14','Ian','Soto','ian','REJECTED','CANCELLED','CANCELLED','home','DEMO-001',124000,'bare-tool'],
 ['1017','2026-10-13','Luz','Vera','luz','APPROVED','PAID','PENDING','pickup','LUM-042',84500,'standard'],
 ['1018','2026-10-13','Ana','Luna','ana','APPROVED','PAID','DELIVERED','home','DEMO-001',198800,'kit-completo'],
 ['1019','2026-10-13','Tomás','Rey','tomas','APPROVED','PAID','SHIPPED','home','DEMO-001',198800,'kit-completo'],
 ['1020','2026-10-12','Sara','Díaz','sara','APPROVED','PAID','DELIVERED','home','LMP-044',62300,'standard'],
 ['1021','2026-10-11','Omar','Paz','omar','REFUNDED','REFUNDED','DELIVERED','home','VLD-043',71900,'outlet-unit-01'],
 ['1022','2026-10-15','Eva','Ríos','eva','APPROVED','PAID_STOCK_REVIEW','PENDING','home','DEMO-001',198800,'kit-completo'],
] as const;
const fail=():never=>{throw new Error('La migración V8 encontró una colisión. Conservamos los datos; revisá disponibilidad e identidades y reintentá.');};
export class MigrateOrdersV7ToV8Step {
 execute(snapshot:DemoSnapshot):DemoSnapshot{
  const reserved=new Map<string,number>();for(const order of snapshot.orders.filter(x=>x.payment===PaymentStatus.Pending))for(const line of order.lines)reserved.set(line.sku,(reserved.get(line.sku)??0)+line.quantity);if(snapshot.products.some(x=>x.reserved!==(reserved.get(x.sku)??0)))throw new Error('Las reservas V7 no coinciden con sus pedidos pendientes.');
  // Work on detached containers. A failure never changes the supplied V7.
  const next={...snapshot,orders:[...snapshot.orders],actors:[...snapshot.actors],products:snapshot.products.map(x=>({...x})),catalogDetails:[...snapshot.catalogDetails],aftercare:{returns:[...snapshot.aftercare.returns],incidents:[...snapshot.aftercare.incidents]}};
  for(const [sku,name,price,outlet] of [['LMP-044','Lámpara histórica',6230000,false],['VLD-043','Unidad Outlet histórica',7190000,true]] as const){const found=next.products.find(x=>x.sku===sku);if(found){const detail=next.catalogDetails.find(x=>x.sku===sku);if(found.price!==price||!outlet&&found.active||outlet&&(!detail||detail.notSellable!==1||detail.kind!==ProductCondition.Outlet))fail();}else{const product:DemoProduct={sku,name,price,original:price,category:outlet?'Outlet':'Histórico',brand:'Demo',description:'Venta histórica; no disponible para comprar.',onHand:outlet?1:2,reserved:0,active:false,tone:'#667b94',variant:'Estándar',supportsCase:false};next.products.push(product);const detail=new MigrateCatalogV4ToV5Step().execute([product])[0];if(outlet){detail.kind=ProductCondition.Outlet;detail.condition=ItemCondition.Used;detail.notSellable=1;detail.warrantyTerms='Unidad histórica no vendible.';detail.media=[{id:'VLD-043-history',assetId:'outlet-drill-main',alt:'Imagen simulada de unidad Outlet histórica'}];detail.outlet={scope:OutletScope.Unit,reference:'outlet-unit-01',notes:'Unidad histórica retenida.',defects:'Pendiente de evaluación.'} as typeof detail.outlet;}next.catalogDetails.push(detail);}}
  for(const row of fixtures){const [number,date,firstName,lastName,email,payment,status,shipment,modality,sku,ars,variant]=row,id='ORD-'+number,actor='buyer-'+id.toLowerCase();
   const existingActor=next.actors.find(x=>x.id===actor);if(existingActor){if(existingActor.email!==email+'@demo.invalid'||existingActor.firstName!==firstName||existingActor.lastName!==lastName)fail();}else{if(next.actors.some(x=>x.email.trim().toLowerCase()===email+'@demo.invalid'))fail();next.actors.push({id:actor,email:email+'@demo.invalid',firstName,lastName,phone:'',addresses:[],favorites:[],cart:[],access:{state:CustomerAccountState.Active,generation:0,reason:''}});}
   const lines:DemoOrder['lines']=[{sku,name:next.products.find(x=>x.sku===sku)!.name,quantity:1,unit:ars*100,variant:DemoProductVariant.Standard,historicalVariant:Variant.fromWire(variant)}];if(number==='1007')lines.push({sku:'LUM-042',name:next.products.find(x=>x.sku==='LUM-042')!.name,quantity:1,unit:8450000,variant:DemoProductVariant.Standard,historicalVariant:Variant.Standard});
   const existing=next.orders.find(x=>x.id===id),total=lines.reduce((n,x)=>n+x.quantity*x.unit,0);if(existing){if(existing.actor!==actor||existing.createdDate!==date||existing.total!==total||existing.lines.length!==lines.length||existing.lines.some((x,i)=>x.sku!==lines[i].sku||x.quantity!==lines[i].quantity||x.unit!==lines[i].unit||x.historicalVariant!==lines[i].historicalVariant))fail();continue;}
   if(number==='1012'){const product=next.products.find(x=>x.sku==='DEMO-001')!;if(product.onHand-product.reserved<1)fail();product.reserved++;}
   const shipmentType=ShipmentStatus.fromWire(shipment);next.orders.push({id,actor,createdDate:date,request:'seed-'+id,status:OrderStatus.fromWire(status),payment:PaymentStatus.fromWire(payment),shipment:shipmentType,fulfillment:DemoDeliveryMethod.fromWire(modality),pickupStage:number==='1007'?Pickup.Collected:number==='1017'?Pickup.Ready:Pickup.None,incidentStatus:number==='1018'?Incident.Resolved:number==='1019'?Incident.Open:number==='1022'?Incident.StockReview:Incident.None,lines,total,address:'',tracking:modality==='home'&&[ShipmentStatus.Shipped,ShipmentStatus.Delivered].includes(shipmentType)?'SC-'+number:'',history:['Pedido de muestra · '+date],returned:false});
  }
  const order=next.orders.find(x=>x.id==='ORD-1021')!,stages=[ReturnStage.Submitted,ReturnStage.Review,ReturnStage.Approved,ReturnStage.Received,ReturnStage.RefundPending,ReturnStage.Refunded];const record={id:'RETURN-1021-1',orderId:order.id,actorId:order.actor,reason:ReturnReason.ChangedMind,outcome:ReturnOutcome.Accepted,stage:ReturnStage.Refunded,lines:[{index:0,sku:'VLD-043',variant:DemoProductVariant.Standard,quantity:1,unit:7190000}],refund:{status:RefundStatus.Refunded,amount:7190000},events:stages.map((stage,index)=>({id:'RETURN-1021-1-'+index,stage,date:'2026-10-11'}))};const existing=next.aftercare.returns.find(x=>x.id===record.id||x.orderId===order.id);if(existing){if(JSON.stringify(existing)!==JSON.stringify(AftercareCodec.fromWire({returns:[record],incidents:[]},next.orders).returns[0]))fail();}else next.aftercare.returns.push(record);
  next.orders=next.orders.map(order=>DemoOrderMetadataCodec.fromWire(order));AftercareCodec.fromWire(next.aftercare,next.orders);const aggregate=new Map<string,number>();for(const order of next.orders.filter(x=>x.payment===PaymentStatus.Pending))for(const line of order.lines)aggregate.set(line.sku,(aggregate.get(line.sku)??0)+line.quantity);for(const product of next.products){if(product.reserved!==(aggregate.get(product.sku)??0))fail();new CatalogProductPolicy().validate(product,DemoProductVariant.Case.extraUnit);}for(const detail of next.catalogDetails)CatalogDetailsPolicy.validate(detail,next.products.find(x=>x.sku===detail.sku)!,true);next.version=8;return next;
 }
}

/** Once-only migration for snapshots predating persisted authority. */
export class MigrateOrderOriginV10ToV11Step {
 execute(snapshot:DemoSnapshot):DemoSnapshot {
  return {...snapshot,version:11,orders:snapshot.orders.map(order=>({...order,origin:Object.prototype.hasOwnProperty.call(order,'origin')?DemoOrderOrigin.fromWire(order.origin?.wire):DemoOrderScope.includes(order.id)?DemoOrderOrigin.Canonical:DemoOrderOrigin.Legacy}))};
 }
}
