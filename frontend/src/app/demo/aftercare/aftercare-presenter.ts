import { DemoContext,type DemoOrder,type DemoSnapshot } from '../demo-model';
import { DemoCheckoutResultPresenter,DemoResultOutcome } from '../checkout/demo-checkout-result';
import { DemoOrderDate,OrderDatePrecision } from '../orders/demo-order-date';
import { AftercareEligibilityStep,RefundSummaryStep,CancelSubmittedStep } from './aftercare-flow';
import { AftercareIssue } from './aftercare-types';
import { returnAmount } from './aftercare-ledger';

export class DemoAftercarePresenter {
  private readonly result=new DemoCheckoutResultPresenter();private readonly eligibility=new AftercareEligibilityStep();private readonly refund=new RefundSummaryStep();
  execute(snapshot:DemoSnapshot,id:string|null,context:DemoContext,actor:string){
    const result=this.result.execute(snapshot.orders,id,context,actor),order=result.order;
    if(!order)return null;
    const returns=snapshot.aftercare.returns.filter(row=>row.orderId===order.id&&row.actorId===actor),incidents=snapshot.aftercare.incidents.filter(row=>row.orderId===order.id&&row.actorId===actor),date=DemoOrderDate.fromWire(order.createdDate);
    const eligibility=this.eligibility.execute(snapshot,order),refund=this.refund.execute(order,returns);
    return{order,result,date,returns:returns.map(row=>({...row,canCancel:new CancelSubmittedStep().permits(snapshot,order,row),amount:returnAmount(row.lines),events:row.events.map(event=>({...event,date:DemoOrderDate.fromWire(event.date)}))})),incidents:incidents.map(row=>({...row,date:DemoOrderDate.fromWire(row.date)})),eligibility,refund,lines:order.lines.map((line,index)=>({...line,index,available:eligibility===AftercareIssue.Legacy||eligibility===AftercareIssue.Unknown?null:this.eligibility.available(snapshot,order,index)})),canRequest:eligibility===AftercareIssue.None,canIncident:result.outcome===DemoResultOutcome.Approved,createdKnown:date.precision!==OrderDatePrecision.Unknown};
  }
}
export function safeReceipt(order:DemoOrder,money:(value:number)=>string):string {
  const delivery=order.delivery?`Entrega ${order.delivery.method.label} · ${money(order.delivery.cost)}`:`Entrega ${order.fulfillment?.label??'Modalidad no informada'} · Costo no informado`;
  return['COMPROBANTE DEMO — NO FISCAL',order.id,`Pago ${order.payment.label} · ${order.method?.label??'Medio de pago no informado'}`,order.address,...order.lines.map(line=>`${line.name} × ${line.quantity} · ${money(line.unit*line.quantity)}`),delivery,`TOTAL ${money(order.total)}`,'Sin cobro real ni validez fiscal.'].join('\n');
}
