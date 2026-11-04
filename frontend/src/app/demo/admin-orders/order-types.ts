import {ShipmentStatus} from '../../domain/order/commerce-states';
import {DemoDeliveryMethod} from '../demo-process-types';
import type {DemoOrder,DemoSnapshot} from '../demo-model';
import {IncidentStatus,IncidentReason,ReturnStage,RefundStatus} from '../aftercare/aftercare-types';
import {ReturnRecordPolicy} from '../aftercare/aftercare-ledger';
import {DemoProductVariant} from '../catalog/product-variant';

export class DemoPickupStage {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly None=new DemoPickupStage('NONE','Sin retiro');static readonly Ready=new DemoPickupStage('READY','Listo para retirar');static readonly Collected=new DemoPickupStage('COLLECTED','Retirado');static readonly Unknown=new DemoPickupStage('UNKNOWN','Retiro desconocido');
 static readonly all=[this.None,this.Ready,this.Collected];static fromWire(raw:unknown){return this.all.find(x=>x.wire===raw)??this.Unknown;}
}
export class DemoHistoricalVariant {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Kit=new DemoHistoricalVariant('kit-completo','Kit completo');static readonly BareTool=new DemoHistoricalVariant('bare-tool','Herramienta sola');static readonly Standard=new DemoHistoricalVariant('standard','Estándar');static readonly OutletUnit01=new DemoHistoricalVariant('outlet-unit-01','Unidad Outlet 01');static readonly Unknown=new DemoHistoricalVariant('UNKNOWN','Presentación desconocida');
 static readonly all=[this.Kit,this.BareTool,this.Standard,this.OutletUnit01];static fromWire(raw:unknown){return this.all.find(x=>x.wire===raw)??this.Unknown;}
}
export class OrderLinePresentation {
 private constructor(readonly historical:DemoHistoricalVariant|null,readonly variant:DemoProductVariant|null,readonly label:string){}
 static readonly Unknown=new OrderLinePresentation(null,null,'Presentación no disponible');
 private static readonly all=[null,...DemoHistoricalVariant.all].flatMap(historical=>[null,...DemoProductVariant.all].map(variant=>new OrderLinePresentation(historical,variant,historical?(variant&&variant!==DemoProductVariant.Standard?historical.label+' · '+variant.label:historical.label):variant?.label??this.Unknown.label)));
 static project(line:{historicalVariant?:DemoHistoricalVariant;variant?:DemoProductVariant}){if(!line.historicalVariant&&!line.variant||line.historicalVariant===DemoHistoricalVariant.Unknown||line.variant===DemoProductVariant.Unknown)return this.Unknown;return this.all.find(value=>value.historical===(line.historicalVariant??null)&&value.variant===(line.variant??null))??this.Unknown;}
}
export class DemoIncidentState {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly None=new DemoIncidentState('NONE','Sin incidencia');static readonly Open=new DemoIncidentState('OPEN','Abierta');static readonly Resolved=new DemoIncidentState('RESOLVED','Resuelta');static readonly StockReview=new DemoIncidentState('STOCK_REVIEW','Stock en revisión');static readonly Unknown=new DemoIncidentState('UNKNOWN','Incidencia desconocida');
 static readonly all=[this.None,this.Open,this.Resolved,this.StockReview];static fromWire(raw:unknown){return this.all.find(x=>x.wire===raw)??this.Unknown;}get permits(){return this===DemoIncidentState.None||this===DemoIncidentState.Resolved;}
}
/** One metadata boundary. Missing legacy defaults are semantic facts, not new JSON fields. */
export class DemoOrderMetadataCodec {
 static fromWire(order:DemoOrder):DemoOrder {
  const hasIncident=Object.prototype.hasOwnProperty.call(order,'incidentStatus'),hasPickup=Object.prototype.hasOwnProperty.call(order,'pickupStage');
  const incident=hasIncident?DemoIncidentState.fromWire(order.incidentStatus?.wire):order.incident?DemoIncidentState.Open:DemoIncidentState.None;
  return {...order,...(hasIncident||incident!==DemoIncidentState.None?{incidentStatus:incident}:{}),...(hasPickup?{pickupStage:DemoPickupStage.fromWire(order.pickupStage?.wire)}:{})};
 }
}
export class DemoIncidentProjectionStep {
 execute(snapshot:DemoSnapshot,order:DemoOrder):DemoIncidentState{const states=snapshot.aftercare.incidents.filter(x=>x.orderId===order.id).map(x=>x.status),own=order.incidentStatus??DemoIncidentState.None;if(own===DemoIncidentState.Unknown||states.includes(IncidentStatus.Unknown)||snapshot.aftercare.incidents.some(x=>x.orderId===order.id&&x.reason===IncidentReason.Unknown))return DemoIncidentState.Unknown;if(own===DemoIncidentState.Open||states.includes(IncidentStatus.Submitted))return DemoIncidentState.Open;if(own===DemoIncidentState.StockReview)return own;if(own===DemoIncidentState.Resolved||states.includes(IncidentStatus.Closed))return DemoIncidentState.Resolved;return DemoIncidentState.None;}
}
export class DemoFulfillmentState {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Pending=new DemoFulfillmentState('PENDING','Pendiente');static readonly Preparing=new DemoFulfillmentState('PREPARING','Preparando');static readonly Shipped=new DemoFulfillmentState('SHIPPED','Enviado');static readonly Delivered=new DemoFulfillmentState('DELIVERED','Entregado');static readonly Cancelled=new DemoFulfillmentState('CANCELLED','Cancelado');static readonly ReadyPickup=new DemoFulfillmentState('READY_PICKUP','Listo para retirar');static readonly Collected=new DemoFulfillmentState('COLLECTED','Retirado');static readonly Unknown=new DemoFulfillmentState('UNKNOWN','Entrega desconocida');
 static readonly all=[this.Pending,this.Preparing,this.Shipped,this.Delivered,this.Cancelled,this.ReadyPickup,this.Collected];static fromWire(raw:unknown){return this.all.find(x=>x.wire===raw)??this.Unknown;}
 static project(order:DemoOrder){if(order.fulfillment===DemoDeliveryMethod.Home&&(order.pickupStage??DemoPickupStage.None)===DemoPickupStage.None)return this.fromWire(order.shipment.wire);if(order.fulfillment===DemoDeliveryMethod.Pickup&&!order.tracking){if(order.shipment===ShipmentStatus.Pending&&order.pickupStage===DemoPickupStage.Ready)return this.ReadyPickup;if(order.shipment===ShipmentStatus.Delivered&&order.pickupStage===DemoPickupStage.Collected)return this.Collected;}return this.Unknown;}
}
export class DemoAftercareState {
 private constructor(readonly wire:string,readonly label:string,readonly blocks:boolean){}
 static readonly None=new DemoAftercareState('NONE','Sin devolución',false);static readonly Active=new DemoAftercareState('ACTIVE','Devolución activa',true);static readonly Refunded=new DemoAftercareState('REFUNDED','Reembolsada',false);static readonly Closed=new DemoAftercareState('CLOSED','Devolución finalizada',false);static readonly Unknown=new DemoAftercareState('UNKNOWN','Posventa desconocida',true);
 static readonly all=[this.None,this.Active,this.Refunded,this.Closed];static fromWire(raw:unknown){return this.all.find(x=>x.wire===raw)??this.Unknown;}
 static project(snapshot:DemoSnapshot,order:DemoOrder){const rows=snapshot.aftercare.returns.filter(x=>x.orderId===order.id);if(order.returned||order.id==='ORD-1021'&&!rows.length||rows.some(x=>!ReturnRecordPolicy.known(x)))return this.Unknown;if(rows.some(x=>!x.stage.terminal&&x.stage!==ReturnStage.Refunded))return this.Active;if(rows.some(x=>x.refund.status===RefundStatus.Refunded))return this.Refunded;return rows.length?this.Closed:this.None;}
 static label(snapshot:DemoSnapshot,order:DemoOrder){const state=this.project(snapshot,order);if(state!==this.Refunded)return state.label;const refunded=snapshot.aftercare.returns.filter(x=>x.orderId===order.id&&x.refund.status===RefundStatus.Refunded).flatMap(x=>x.lines).reduce((n,x)=>n+x.quantity,0),total=order.lines.reduce((n,x)=>n+x.quantity,0);return refunded<total?`${refunded} reembolsada / ${total-refunded} disponible`:state.label;}
}
export class DemoOrderOperations {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Queue=new DemoOrderOperations('QUEUE','Gestionar entrega en pedidos');static readonly Legacy=new DemoOrderOperations('LEGACY','Escenario legacy');static readonly Unknown=new DemoOrderOperations('UNKNOWN','Operaciones desconocidas');static readonly all=[this.Queue,this.Legacy];
 static fromWire(order:unknown):DemoOrderOperations{if(typeof order==='string')return this.all.find(value=>value.wire===order)??this.Unknown;return order&&typeof order==='object'&&typeof (order as {id?:unknown}).id==='string'?DemoOrderScope.operations((order as {id:string}).id):this.Unknown;}
 get customerPaymentGuidance():string{return this===DemoOrderOperations.Queue?'Podés consultar el pago registrado. Su actualización se gestiona desde el comercio.':'Las operaciones de pago no están disponibles para este pedido.';}
}
export class DemoOrderScope {
 static readonly ids=Object.freeze(['ORD-1007','ORD-1012','ORD-1013','ORD-1014','ORD-1015','ORD-1016','ORD-1017','ORD-1018','ORD-1019','ORD-1020','ORD-1021','ORD-1022']);
 static includes(id:string){return this.ids.includes(id);}
 static operations(id:string):DemoOrderOperations{return !id.trim()?DemoOrderOperations.Unknown:this.includes(id)?DemoOrderOperations.Queue:DemoOrderOperations.Legacy;}
}
export class AuthorizeLegacyDemoOrderStep {
 execute(order:DemoOrder|undefined):DemoOrder {if(DemoOrderOperations.fromWire(order)!==DemoOrderOperations.Legacy)throw new Error('Este pedido se gestiona con los comandos de la cola operativa.');return order!;}
}
