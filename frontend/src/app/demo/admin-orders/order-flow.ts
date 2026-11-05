import {UserRole} from '../../domain/user/user-role';
import {OrderStatus,PaymentStatus,ShipmentStatus} from '../../domain/order/commerce-states';
import {DemoContext,type DemoSnapshot,type DemoOrder} from '../demo-model';
import {DemoDeliveryMethod} from '../demo-process-types';
import {DemoPickupStage,DemoFulfillmentState,DemoIncidentProjectionStep,DemoAftercareState,DemoOrderOrigin,DemoHistoricalVariant} from './order-types';
import {DemoProductVariant} from '../catalog/product-variant';
export interface OrderAuthority{context:DemoContext;role:UserRole;actor:string;epoch:number;readable:boolean;}
export class AuthorizeDemoOrdersStep {
 permits(a:OrderAuthority){return a.readable&&a.context===DemoContext.Admin&&[UserRole.Admin,UserRole.Operator].includes(a.role)&&!!a.actor;}
 execute(a:OrderAuthority){if(!this.permits(a))throw new Error('Acceso denegado.');}
}
export interface OrderIntent {id:string;actor:string;epoch:number;revision:number;fingerprint:string;tracking:string;}
export abstract class DemoOrderCommand {
 abstract readonly label:string;abstract readonly requiresTracking:boolean;abstract readonly effect:string;
 protected abstract origin(order:DemoOrder):boolean;protected abstract destination(order:DemoOrder,tracking:string):boolean;protected abstract apply(order:DemoOrder,tracking:string):void;
 permits(snapshot:DemoSnapshot,order:DemoOrder){return order.origin===DemoOrderOrigin.Canonical&&order.lines.every(line=>line.variant!==DemoProductVariant.Unknown&&!!line.historicalVariant&&line.historicalVariant!==DemoHistoricalVariant.Unknown)&&order.payment===PaymentStatus.Approved&&order.status===OrderStatus.Paid&&DemoFulfillmentState.project(order)!==DemoFulfillmentState.Unknown&&new DemoIncidentProjectionStep().execute(snapshot,order).permits&&!DemoAftercareState.project(snapshot,order).blocks&&this.origin(order);}
 execute(snapshot:DemoSnapshot,authority:OrderAuthority,intent:OrderIntent):boolean{new AuthorizeDemoOrdersStep().execute(authority);if(snapshot.orders.find(order=>order.id===intent.id)?.origin!==DemoOrderOrigin.Canonical)throw new Error('Pedido fuera de la cola operativa.');if(authority.actor!==intent.actor||authority.epoch!==intent.epoch)throw new Error('La sesión cambió.');const order=snapshot.orders.find(x=>x.id===intent.id);if(!order)throw new Error('Pedido no disponible.');const tracking=intent.tracking.trim();if(this.requiresTracking&&!tracking)throw new Error('Ingresá el tracking manual.');if(this.destination(order,tracking)&&order.payment===PaymentStatus.Approved&&order.status===OrderStatus.Paid&&new DemoIncidentProjectionStep().execute(snapshot,order).permits&&!DemoAftercareState.project(snapshot,order).blocks)return false;if(snapshot.revision!==intent.revision||JSON.stringify(order)!==intent.fingerprint)throw new Error('Conflicto: los datos cambiaron. Conservamos la propuesta; revisá el estado actual.');if(!this.permits(snapshot,order))throw new Error('La transición no está disponible.');this.apply(order,tracking);order.history.push(this.label+' · simulación');snapshot.revision++;return true;}
}
export class ShipDemoOrderStep extends DemoOrderCommand {
 readonly label='Marcar enviado';readonly requiresTracking=true;
 readonly effect=ShipmentStatus.Preparing.label+' → '+ShipmentStatus.Shipped.label+'. Se guarda el tracking manual propuesto; no cambia pago ni stock.';
 protected origin(o:DemoOrder){return o.fulfillment===DemoDeliveryMethod.Home&&o.pickupStage===DemoPickupStage.None&&o.shipment===ShipmentStatus.Preparing&&!o.tracking;}
 protected destination(o:DemoOrder,t:string){return o.fulfillment===DemoDeliveryMethod.Home&&o.pickupStage===DemoPickupStage.None&&o.shipment===ShipmentStatus.Shipped&&o.tracking===t;}
 protected apply(o:DemoOrder,t:string){o.shipment=ShipmentStatus.Shipped;o.tracking=t;}
}
export class DeliverDemoOrderStep extends DemoOrderCommand {
 readonly label='Marcar entregado';readonly requiresTracking=false;
 readonly effect=ShipmentStatus.Shipped.label+' → '+ShipmentStatus.Delivered.label+'. Se conserva el tracking; no cambia pago ni stock.';
 protected origin(o:DemoOrder){return o.fulfillment===DemoDeliveryMethod.Home&&o.pickupStage===DemoPickupStage.None&&o.shipment===ShipmentStatus.Shipped&&!!o.tracking.trim();}
 protected destination(o:DemoOrder,t:string){return o.fulfillment===DemoDeliveryMethod.Home&&o.pickupStage===DemoPickupStage.None&&o.shipment===ShipmentStatus.Delivered&&o.tracking===t;}
 protected apply(o:DemoOrder){o.shipment=ShipmentStatus.Delivered;}
}
export class CollectDemoPickupStep extends DemoOrderCommand {
 readonly label='Marcar retirado';readonly requiresTracking=false;
 readonly effect=DemoPickupStage.Ready.label+' → '+DemoPickupStage.Collected.label+'. La entrega queda '+ShipmentStatus.Delivered.label.toLowerCase()+', sin tracking ni cambios de pago o stock.';
 protected origin(o:DemoOrder){return o.fulfillment===DemoDeliveryMethod.Pickup&&o.pickupStage===DemoPickupStage.Ready&&o.shipment===ShipmentStatus.Pending&&!o.tracking;}
 protected destination(o:DemoOrder,t:string){return !t&&!o.tracking&&o.fulfillment===DemoDeliveryMethod.Pickup&&o.pickupStage===DemoPickupStage.Collected&&o.shipment===ShipmentStatus.Delivered;}
 protected apply(o:DemoOrder){o.pickupStage=DemoPickupStage.Collected;o.shipment=ShipmentStatus.Delivered;}
}
export const orderCommands:readonly DemoOrderCommand[]=[new ShipDemoOrderStep(),new DeliverDemoOrderStep(),new CollectDemoPickupStep()];
