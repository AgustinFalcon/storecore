import {PaymentStatus,OrderStatus,ShipmentStatus} from '../../domain/order/commerce-states';
import {type DemoSnapshot,type DemoOrder,DemoProductVariant} from '../demo-model';
import {AftercareCodec,returnAmount,ReturnRecordPolicy,type ReturnRecord} from '../aftercare/aftercare-ledger';
import {AftercareEligibilityStep,ValidateReturnProposalStep} from '../aftercare/aftercare-flow';
import {ReturnStage,ReturnOutcome,ReturnReason,RefundStatus,ReturnDisposition,ReturnCommandResult,AftercareIssue} from '../aftercare/aftercare-types';
import {AuthorizeDemoOrdersStep,type OrderAuthority} from './order-flow';
import {CatalogDetailsPolicy,CatalogDetailsRead} from '../rich-catalog/catalog-details';
import {DemoOrderOrigin,DemoIncidentState,DemoFulfillmentState,DemoIncidentProjectionStep,DemoAftercareState,OrderLinePresentation} from './order-types';
import {OrderQueueQuery} from './order-query';
import {DemoOrderDate,OrderDatePrecision} from '../orders/demo-order-date';

export interface ReturnCommand {id:string;recordId:string;orderId:string;actor:string;epoch:number;revision:number;reason:ReturnReason;quantities:readonly number[];observation:string;internalNotes:string;disposition:ReturnDisposition;}
export class ReturnStepProgress {
 private constructor(readonly label:string){}
 static readonly Completed=new ReturnStepProgress('Completado · consultá el expediente');static readonly Available=new ReturnStepProgress('Disponible ahora');static readonly Blocked=new ReturnStepProgress('Bloqueado · requiere completar la etapa anterior y datos válidos.');
}
export class ReturnCaseSection {
 private constructor(readonly label:string){}
 static readonly Active=new ReturnCaseSection('Expediente activo');static readonly History=new ReturnCaseSection('Historial de devoluciones');
 static project(records:readonly ReturnRecord[],active:ReturnRecord|null){return[{kind:this.Active,records:active?[active]:[]},{kind:this.History,records:records.filter(record=>record!==active)}].filter(section=>section.records.length>0);}
}
export class OrderReturnDestination {
 private constructor(readonly query:OrderQueueQuery,readonly focus:string){}
 static fromWire(raw:Record<string,unknown>,id:string){const query=OrderQueueQuery.fromWire(raw);return new OrderReturnDestination(query.known?query:OrderQueueQuery.fromWire({}),typeof raw['focus']==='string'&&raw['focus']===id?raw['focus']:id);}
 readonly path='/demo/user/orders';get params(){return{...this.query.params,focus:this.focus||null};}
}
export abstract class OperationalReturnStep {
 abstract readonly label:string;abstract readonly description:string;abstract readonly destination:ReturnStage;abstract readonly origin:ReturnStage|null;
 progress(records:readonly ReturnRecord[],next:OperationalReturnStep|null):ReturnStepProgress{return records.some(record=>record.events.some(event=>event.stage===this.destination))?ReturnStepProgress.Completed:next===this?ReturnStepProgress.Available:ReturnStepProgress.Blocked;}
 payload(command:ReturnCommand):string{return JSON.stringify({orderId:command.orderId,recordId:command.recordId,step:this.destination.wire,...this.fields(command)});}
 protected abstract fields(command:ReturnCommand):object;
 protected abstract apply(snapshot:DemoSnapshot,order:DemoOrder,record:ReturnRecord|undefined,command:ReturnCommand):ReturnRecord;
 permits(snapshot:DemoSnapshot,order:DemoOrder):boolean{
  if(order.lines.some(line=>OrderLinePresentation.project(line)===OrderLinePresentation.Unknown)||order.origin!==DemoOrderOrigin.Canonical||order.payment!==PaymentStatus.Approved||order.status!==OrderStatus.Paid||order.shipment!==ShipmentStatus.Delivered||order.returned||DemoFulfillmentState.project(order)===DemoFulfillmentState.Unknown||new DemoIncidentProjectionStep().execute(snapshot,order)===DemoIncidentState.Unknown)return false;
  const rows=snapshot.aftercare.returns.filter(r=>r.orderId===order.id);
  if(rows.some(row=>row.stage===ReturnStage.Unknown||row.outcome===ReturnOutcome.Unknown||row.reason===ReturnReason.Unknown||row.refund.status===RefundStatus.Unknown||row.operations?.disposition===ReturnDisposition.Unknown||row.events.some(event=>event.stage===ReturnStage.Unknown||DemoOrderDate.fromWire(event.date).precision===OrderDatePrecision.Unknown)||row.lines.some(line=>line.variant===DemoProductVariant.Unknown)))return false;
  if(this.origin===null)return new AftercareEligibilityStep().execute(snapshot,order)===AftercareIssue.None;
  return rows.some(row=>row.stage===this.origin&&(row.operations!==undefined||this.origin===ReturnStage.Submitted&&row.events.length===1&&row.events[0].stage===ReturnStage.Submitted));
 }
 execute(snapshot:DemoSnapshot,a:OrderAuthority,c:ReturnCommand,date:string):ReturnCommandResult{
  if(!new AuthorizeDemoOrdersStep().permits(a)||a.actor!==c.actor||a.epoch!==c.epoch)return ReturnCommandResult.Unauthorized;
  const order=snapshot.orders.find(o=>o.id===c.orderId);if(!order)return ReturnCommandResult.Blocked;
  const existing=snapshot.aftercare.returns.find(row=>row.id===c.recordId),payload=this.payload(c);
  const event=snapshot.aftercare.returns.flatMap(row=>row.events).find(event=>event.id===c.id);
  if(event)return event.payload===payload&&event.operatorId===a.actor?ReturnCommandResult.AlreadyApplied:ReturnCommandResult.Conflict;
  if(!c.id||!c.recordId||!this.permits(snapshot,order)||this.origin!==null&&(!existing||existing.orderId!==order.id||existing.stage!==this.origin)||this.origin===null&&existing)return ReturnCommandResult.Blocked;
  if(snapshot.revision!==c.revision)return ReturnCommandResult.Conflict;
  const changed=this.apply(snapshot,order,existing,c);
  changed.events.push({id:c.id,stage:this.destination,date,operatorId:a.actor,payload});
  snapshot.aftercare=AftercareCodec.fromWire({returns:existing?snapshot.aftercare.returns.map(row=>row===existing?changed:row):[...snapshot.aftercare.returns,changed],incidents:snapshot.aftercare.incidents},snapshot.orders);
  snapshot.revision++;return ReturnCommandResult.Applied;
 }
}
export class RequestReturnStep extends OperationalReturnStep {
 readonly description='Se crea un expediente independiente para las cantidades seleccionadas. Se conservan los precios de la compra.';
 readonly label='Solicitar devolución';readonly origin=null;readonly destination=ReturnStage.Submitted;
 protected fields(c:ReturnCommand){return{reason:c.reason.wire,quantities:c.quantities};}
 protected apply(snapshot:DemoSnapshot,order:DemoOrder,_record:ReturnRecord|undefined,c:ReturnCommand):ReturnRecord{const lines=new ValidateReturnProposalStep().execute(snapshot,order,{id:c.recordId,orderId:order.id,reason:c.reason,quantities:c.quantities});return{id:c.recordId,orderId:order.id,actorId:order.actor,reason:c.reason,lines,stage:this.destination,outcome:ReturnOutcome.Pending,refund:{status:RefundStatus.None,amount:0},events:[],operations:{}};}
}
export class ReceiveReturnStep extends OperationalReturnStep {
 readonly description='Se registra la recepción de todas las unidades del expediente. No modifica stock ni dinero.';
 readonly label='Registrar recepción';readonly origin=ReturnStage.Submitted;readonly destination=ReturnStage.Received;
 protected fields(){return{};}
 protected apply(_s:DemoSnapshot,_o:DemoOrder,r:ReturnRecord|undefined):ReturnRecord{return{...r!,stage:this.destination,outcome:ReturnOutcome.Accepted,events:[...r!.events],operations:r!.operations??{}};}
}
export class InspectReturnStep extends OperationalReturnStep {
 readonly description='Se registra lo observado y una nota interna opcional. No clasifica productos ni modifica stock o dinero.';
 readonly label='Registrar inspección';readonly origin=ReturnStage.Received;readonly destination=ReturnStage.Inspected;
 protected fields(c:ReturnCommand){return{observation:c.observation.trim(),internalNotes:c.internalNotes.trim()};}
 protected apply(_s:DemoSnapshot,_o:DemoOrder,r:ReturnRecord|undefined,c:ReturnCommand):ReturnRecord{if(!c.observation.trim()||c.observation.length>1000||c.internalNotes.length>1000)throw new Error('Ingresá una observación de hasta 1000 caracteres.');return{...r!,stage:this.destination,events:[...r!.events],operations:{...r!.operations,observation:c.observation.trim(),...(c.internalNotes.trim()?{internalNotes:c.internalNotes.trim()}:{})}};}
}
export class DisposeReturnStep extends OperationalReturnStep {
 readonly description='Se incorporan todas las unidades al stock físico una sola vez. Las dañadas quedan fuera de la venta.';
 readonly label='Confirmar disposición';readonly origin=ReturnStage.Inspected;readonly destination=ReturnStage.Disposed;
 protected fields(c:ReturnCommand){return{disposition:c.disposition.wire};}
 protected apply(s:DemoSnapshot,_o:DemoOrder,r:ReturnRecord|undefined,c:ReturnCommand):ReturnRecord{
  if(!ReturnDisposition.all.includes(c.disposition))throw new Error('Elegí una disposición válida.');
  for(const line of r!.lines){const product=s.products.find(p=>p.sku===line.sku),detail=CatalogDetailsRead.detail(s,line.sku);if(!product||!detail||!CatalogDetailsPolicy.known(detail)||!Number.isSafeInteger(product.onHand+line.quantity))throw new Error('El stock requiere revisión.');product.onHand+=line.quantity;if(c.disposition===ReturnDisposition.Damaged)detail.notSellable+=line.quantity;CatalogDetailsPolicy.validate(detail,product);s.movements.push({id:c.id+'-'+line.index,sku:line.sku,delta:line.quantity,reason:c.disposition.label+' · '+c.recordId});}
  return{...r!,stage:this.destination,events:[...r!.events],operations:{...r!.operations,disposition:c.disposition}};
 }
}
export class RefundReturnStep extends OperationalReturnStep {
 readonly description='Se registra el importe exacto de los productos del expediente. No modifica stock y conserva el pago aprobado.';
 readonly label='Registrar reintegro';readonly origin=ReturnStage.Disposed;readonly destination=ReturnStage.Refunded;
 protected fields(){return{};}
 protected apply(_s:DemoSnapshot,_o:DemoOrder,r:ReturnRecord|undefined):ReturnRecord{return{...r!,stage:this.destination,events:[...r!.events],refund:{status:RefundStatus.Refunded,amount:returnAmount(r!.lines)}};}
}
export class OperationalReturnFlow {
 readonly steps:readonly OperationalReturnStep[]=[new RequestReturnStep(),new ReceiveReturnStep(),new InspectReturnStep(),new DisposeReturnStep(),new RefundReturnStep()];
 next(snapshot:DemoSnapshot,order:DemoOrder){return this.steps.find(step=>step.permits(snapshot,order))??null;}
 active(snapshot:DemoSnapshot,order:DemoOrder){return snapshot.aftercare.returns.find(record=>record.orderId===order.id&&!record.stage.terminal&&record.stage!==ReturnStage.Refunded)??null;}
}
export class ResolveOperationalIncidentStep {
 readonly label='Resolver incidencia';
 private coherent(snapshot:DemoSnapshot,order:DemoOrder){return order.origin===DemoOrderOrigin.Canonical&&order.lines.every(line=>OrderLinePresentation.project(line)!==OrderLinePresentation.Unknown)&&order.payment===PaymentStatus.Approved&&order.status===OrderStatus.Paid&&DemoFulfillmentState.project(order)!==DemoFulfillmentState.Unknown&&new DemoIncidentProjectionStep().execute(snapshot,order)!==DemoIncidentState.Unknown&&DemoAftercareState.project(snapshot,order)!==DemoAftercareState.Unknown&&snapshot.aftercare.returns.filter(record=>record.orderId===order.id).every(record=>ReturnRecordPolicy.known(record));}
 permits(snapshot:DemoSnapshot,order:DemoOrder){return this.coherent(snapshot,order)&&order.incidentStatus===DemoIncidentState.Open;}
 execute(snapshot:DemoSnapshot,a:OrderAuthority,intent:{actor:string;epoch:number;revision:number;id:string}):ReturnCommandResult{if(!new AuthorizeDemoOrdersStep().permits(a)||a.actor!==intent.actor||a.epoch!==intent.epoch)return ReturnCommandResult.Unauthorized;const order=snapshot.orders.find(o=>o.id===intent.id);if(!order||!this.coherent(snapshot,order))return ReturnCommandResult.Blocked;if(order.incidentStatus===DemoIncidentState.Resolved)return ReturnCommandResult.AlreadyApplied;if(!this.permits(snapshot,order))return ReturnCommandResult.Blocked;if(snapshot.revision!==intent.revision)return ReturnCommandResult.Conflict;order.incidentStatus=DemoIncidentState.Resolved;order.history.push('Incidencia operativa resuelta · '+a.actor);snapshot.revision++;return ReturnCommandResult.Applied;}
}
