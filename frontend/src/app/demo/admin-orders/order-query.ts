import {OrderStatus,PaymentStatus,ShipmentStatus} from '../../domain/order/commerce-states';
import {DemoDeliveryMethod} from '../demo-process-types';
import type {DemoOrder,DemoSnapshot} from '../demo-model';
import {AuthorizeDemoOrdersStep,type OrderAuthority} from './order-flow';
import {DemoOrderScope,DemoIncidentState,DemoIncidentProjectionStep,DemoFulfillmentState,DemoAftercareState} from './order-types';
export class OrderQueueAxis {
 private constructor(readonly wire:string,readonly label:string,readonly values:readonly {wire:string;label:string}[],readonly read:(s:DemoSnapshot,o:DemoOrder)=>{wire:string;label:string}){}
 static readonly Payment=new OrderQueueAxis('payment','Pago',[PaymentStatus.Pending,PaymentStatus.Approved,PaymentStatus.Rejected,PaymentStatus.Cancelled,PaymentStatus.Refunded],(_,o)=>o.payment);
 static readonly Order=new OrderQueueAxis('order','Pedido',[OrderStatus.PendingPayment,OrderStatus.Paid,OrderStatus.PaidStockReview,OrderStatus.Cancelled,OrderStatus.Refunded],(_,o)=>o.status);
 static readonly Fulfillment=new OrderQueueAxis('fulfillment','Entrega',DemoFulfillmentState.all,(_,o)=>DemoFulfillmentState.project(o));
 static readonly Modality=new OrderQueueAxis('modality','Modalidad',DemoDeliveryMethod.all,(_,o)=>o.fulfillment??DemoDeliveryMethod.Unknown);
 static readonly Incident=new OrderQueueAxis('incident','Incidencia',DemoIncidentState.all,(s,o)=>new DemoIncidentProjectionStep().execute(s,o));
 static readonly Aftercare=new OrderQueueAxis('aftercare','Posventa',DemoAftercareState.all,(s,o)=>DemoAftercareState.project(s,o));
 static readonly Unknown=new OrderQueueAxis('','Filtro desconocido',[],()=>DemoIncidentState.Unknown);
 static readonly all=[this.Payment,this.Order,this.Fulfillment,this.Modality,this.Incident,this.Aftercare];static fromWire(raw:unknown){return this.all.find(x=>x.wire===raw)??this.Unknown;}
}
export class OrderQueueFilter {
 private constructor(readonly axis:OrderQueueAxis,readonly value:{wire:string;label:string}|null,readonly known:boolean){}
 static readonly Unknown=new OrderQueueFilter(OrderQueueAxis.Unknown,null,false);
 static fromWire(axis:OrderQueueAxis,raw:unknown){if(axis===OrderQueueAxis.Unknown)return this.Unknown;if(raw===null||raw===undefined||raw==='')return new OrderQueueFilter(axis,null,true);const value=axis.values.find(x=>x.wire===raw);return new OrderQueueFilter(axis,value??null,!!value);}
 matches(snapshot:DemoSnapshot,order:DemoOrder){return !this.value||this.axis.read(snapshot,order)===this.value;}
}
export class OrderQueueQuery {
 private constructor(readonly search:string,readonly filters:readonly OrderQueueFilter[]){}
 static fromWire(raw:Record<string,unknown>){return new OrderQueueQuery(typeof raw['q']==='string'?raw['q'].slice(0,200):'',OrderQueueAxis.all.map(axis=>OrderQueueFilter.fromWire(axis,raw[axis.wire])));}
 get known(){return this.filters.every(x=>x.known);}get params(){return Object.fromEntries([['q',this.search||null],...this.filters.map(x=>[x.axis.wire,x.value?.wire??null])]);}
 execute(snapshot:DemoSnapshot,authority:OrderAuthority){new AuthorizeDemoOrdersStep().execute(authority);return snapshot.orders.filter(o=>DemoOrderScope.includes(o.id)&&this.filters.every(x=>x.matches(snapshot,o))&&[o.id,...snapshot.actors.filter(a=>a.id===o.actor).flatMap(a=>[a.firstName,a.lastName,a.email])].join(' ').toLocaleLowerCase().includes(this.search.trim().toLocaleLowerCase()));}
}
export class ExportDemoOrdersStep {
 execute(snapshot:DemoSnapshot,authority:OrderAuthority,selected:ReadonlySet<string>){new AuthorizeDemoOrdersStep().execute(authority);return ['id,payment,shipment,total,incident',...snapshot.orders.filter(o=>DemoOrderScope.includes(o.id)&&selected.has(o.id)).sort((a,b)=>a.id.localeCompare(b.id)).map(o=>[o.id,o.payment.wire,ShipmentStatus.fromWire(o.shipment.wire).wire,o.total/100,new DemoIncidentProjectionStep().execute(snapshot,o).wire].join(','))].join('\n');}
}
