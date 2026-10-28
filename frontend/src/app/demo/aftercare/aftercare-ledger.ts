import type { DemoOrder } from '../demo-model';
import { DemoProductVariant } from '../demo-model';
import { DemoMoney } from '../checkout/demo-money';
import { DemoOrderDate } from '../orders/demo-order-date';
import { RefundStatus,ReturnOutcome,ReturnReason,ReturnStage,IncidentReason,IncidentStatus } from './aftercare-types';

export interface ReturnLine {index:number;sku:string;variant:DemoProductVariant;quantity:number;unit:number;}
export interface ReturnEvent {id:string;stage:ReturnStage;date:string;}
export interface ReturnRecord {id:string;orderId:string;actorId:string;reason:ReturnReason;stage:ReturnStage;outcome:ReturnOutcome;lines:ReturnLine[];refund:{status:RefundStatus;amount:number};events:ReturnEvent[];}
export interface CustomerIncident {id:string;orderId:string;actorId:string;reason:IncidentReason;status:IncidentStatus;message:string;date:string;}
export interface AftercareLedger {returns:ReturnRecord[];incidents:CustomerIncident[];}
const object=(raw:unknown):Record<string,unknown>=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Posventa guardada inválida.');return raw as Record<string,unknown>;};
const text=(raw:unknown,max=200):string=>{if(typeof raw!=='string'||!raw.trim()||raw.length>max)throw new Error('Posventa guardada inválida.');return raw;};
const integer=(raw:unknown,min=0):number=>{if(typeof raw!=='number'||!Number.isSafeInteger(raw)||raw<min)throw new Error('Cantidades o importes de posventa inválidos.');return raw;};
const wire=(raw:unknown):unknown=>raw&&typeof raw==='object'&&!Array.isArray(raw)?(raw as Record<string,unknown>)['wire']:undefined;
export function returnAmount(lines:readonly ReturnLine[]):number{return lines.reduce((sum,line)=>DemoMoney.add(sum,DemoMoney.multiply(line.unit,line.quantity)),0);}

/** Sole aftercare JSON boundary. Unknown finite values survive only as closed, read-only facts. */
export class AftercareCodec {
  static fromWire(raw:unknown,orders:readonly DemoOrder[]):AftercareLedger {
    const data=object(raw);if(!Array.isArray(data['returns'])||!Array.isArray(data['incidents']))throw new Error('El registro de posventa es inválido.');
    const returns=data['returns'].map(value=>{const row=object(value),orderId=text(row['orderId']),actorId=text(row['actorId']);const order=orders.find(order=>order.id===orderId&&order.actor===actorId);if(!order||!Array.isArray(row['lines'])||!row['lines'].length||!Array.isArray(row['events'])||!row['events'].length)throw new Error('La solicitud no corresponde al pedido.');
      const lines=row['lines'].map(value=>{const line=object(value),index=integer(line['index']),sku=text(line['sku']),quantity=integer(line['quantity'],1),unit=integer(line['unit']),variant=DemoProductVariant.fromWire(wire(line['variant']));const original=order.lines[index];if(!original||original.sku!==sku||original.unit!==unit||DemoProductVariant.fromWire(original.variant?.wire??DemoProductVariant.Standard.wire)!==variant||quantity>original.quantity)throw new Error('La línea de devolución no corresponde a su compra.');return {index,sku,quantity,unit,variant};});
      if(new Set(lines.map(line=>line.index)).size!==lines.length)throw new Error('Líneas de devolución duplicadas.');
      const events=row['events'].map(value=>{const event=object(value);return{id:text(event['id']),stage:ReturnStage.fromWire(wire(event['stage'])),date:text(event['date'])};});
      if(new Set(events.map(event=>event.id)).size!==events.length)throw new Error('Eventos de devolución duplicados.');
      const refund=object(row['refund']);const record:ReturnRecord={id:text(row['id']),orderId,actorId,lines,events,stage:ReturnStage.fromWire(wire(row['stage'])),outcome:ReturnOutcome.fromWire(wire(row['outcome'])),reason:ReturnReason.fromWire(wire(row['reason'])),refund:{status:RefundStatus.fromWire(wire(refund['status'])),amount:integer(refund['amount'])}};
      this.validateRecord(record);return record;
    });
    if(new Set(returns.map(row=>row.id)).size!==returns.length)throw new Error('Solicitudes duplicadas.');
    for(const order of orders){const records=returns.filter(row=>row.orderId===order.id);const refunded=records.reduce((sum,row)=>DemoMoney.add(sum,row.refund.amount),0),goods=order.lines.reduce((sum,line)=>DemoMoney.add(sum,DemoMoney.multiply(line.unit,line.quantity)),0);if(refunded>goods)throw new Error('El reintegro acumulado excede los productos comprados.');for(let index=0;index<order.lines.length;index++){const consumed=records.filter(row=>row.outcome.consumes).flatMap(row=>row.lines).filter(line=>line.index===index).reduce((sum,line)=>DemoMoney.add(sum,line.quantity),0);if(consumed>order.lines[index].quantity)throw new Error('Las devoluciones exceden las unidades compradas.');}if(records.filter(row=>!row.stage.terminal&&row.stage!==ReturnStage.Refunded).length>1)throw new Error('Hay solicitudes activas duplicadas.');}
    const incidents=data['incidents'].map(value=>{const row=object(value),orderId=text(row['orderId']),actorId=text(row['actorId']);if(!orders.some(order=>order.id===orderId&&order.actor===actorId))throw new Error('Consulta sin pedido propio.');const message=typeof row['message']==='string'&&row['message'].length<=1000?row['message']:null;if(message===null)throw new Error('Consulta inválida.');return{id:text(row['id']),orderId,actorId,reason:IncidentReason.fromWire(wire(row['reason'])),status:IncidentStatus.fromWire(wire(row['status'])),message,date:text(row['date'])};});
    if(new Set(incidents.map(row=>row.id)).size!==incidents.length)throw new Error('Consultas duplicadas.');return{returns,incidents};
  }
  private static validateRecord(row:ReturnRecord):void {
    const amount=returnAmount(row.lines);if(row.refund.amount>amount)throw new Error('El reintegro supera los productos solicitados.');
    if(row.events.at(-1)?.stage!==row.stage)throw new Error('Estado y último evento no coinciden.');
    for(let index=1;index<row.events.length;index++){const previous=row.events[index-1],current=row.events[index];if(previous.stage!==ReturnStage.Unknown&&current.stage!==ReturnStage.Unknown&&!previous.stage.permitsNext(current.stage))throw new Error('La secuencia de devolución es incoherente.');if(current.stage===ReturnStage.Closed&&previous.stage!==ReturnStage.Unknown&&row.outcome!==ReturnOutcome.Unknown&&!previous.stage.preservesClosure(row.outcome))throw new Error('El cierre cambia la decisión registrada.');if(DemoOrderDate.fromWire(previous.date).isNotAfter(DemoOrderDate.fromWire(current.date))===false)throw new Error('Las fechas de devolución retroceden.');}
    if(row.stage===ReturnStage.Unknown||row.outcome===ReturnOutcome.Unknown||row.refund.status===RefundStatus.Unknown||row.reason===ReturnReason.Unknown||row.lines.some(line=>line.variant===DemoProductVariant.Unknown))return;
    const refunded=row.stage===ReturnStage.Refunded||(row.stage===ReturnStage.Closed&&row.outcome===ReturnOutcome.Accepted);
    const accepted=[ReturnStage.Approved,ReturnStage.Received,ReturnStage.RefundPending,ReturnStage.Refunded].includes(row.stage);
    if((accepted&&row.outcome!==ReturnOutcome.Accepted)||([ReturnStage.Submitted,ReturnStage.Review].includes(row.stage)&&row.outcome!==ReturnOutcome.Pending)||(row.stage===ReturnStage.Rejected&&row.outcome!==ReturnOutcome.Rejected)||(row.stage===ReturnStage.Cancelled&&row.outcome!==ReturnOutcome.Cancelled)||(row.stage===ReturnStage.Closed&&row.outcome===ReturnOutcome.Pending))throw new Error('Resultado de devolución incoherente.');
    const expected=refunded?RefundStatus.Refunded:row.stage===ReturnStage.RefundPending?RefundStatus.Pending:RefundStatus.None;
    if(row.refund.status!==expected||row.refund.amount!==(refunded?amount:0))throw new Error('Reintegro de devolución incoherente.');
  }
}
