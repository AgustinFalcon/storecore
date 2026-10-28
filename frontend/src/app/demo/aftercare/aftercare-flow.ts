import { DemoContext,DemoProductVariant,type DemoOrder,type DemoSnapshot } from '../demo-model';
import { ShipmentStatus } from '../../domain/order/commerce-states';
import { PresentResultStep,DemoResultOutcome } from '../checkout/demo-checkout-result';
import { DemoOrderDate,OrderDatePrecision } from '../orders/demo-order-date';
import { AftercareCodec,returnAmount,type ReturnLine,type ReturnRecord } from './aftercare-ledger';
import { AftercareIssue,ReturnStage,ReturnOutcome,ReturnReason,RefundStatus,IncidentReason,IncidentStatus } from './aftercare-types';

export interface AftercareAuthority {context:DemoContext;actorId:string;epoch:number;expectedEpoch:number;}
export interface ReturnProposal {id:string;orderId:string;reason:ReturnReason;quantities:readonly number[];}
export class SelectAftercareOrderStep {
  execute(snapshot:DemoSnapshot,orderId:string,authority:AftercareAuthority):DemoOrder {
    const order=snapshot.orders.find(order=>order.id===orderId&&order.actor===authority.actorId);
    if(authority.context!==DemoContext.Customer||authority.epoch!==authority.expectedEpoch||!order||!snapshot.actors.find(actor=>actor.id===authority.actorId)?.access?.state.permitsAccess)throw new Error(AftercareIssue.Authority.label);
    return order;
  }
}
export class AftercareEligibilityStep {
  private readonly result=new PresentResultStep();
  execute(snapshot:DemoSnapshot,order:DemoOrder):AftercareIssue {
    if(order.returned)return AftercareIssue.Legacy;
    const records=snapshot.aftercare.returns.filter(row=>row.orderId===order.id);
    if(records.some(row=>row.stage===ReturnStage.Unknown||row.outcome===ReturnOutcome.Unknown||row.reason===ReturnReason.Unknown||row.refund.status===RefundStatus.Unknown||row.lines.some(line=>line.variant===DemoProductVariant.Unknown)||row.events.some(event=>event.stage===ReturnStage.Unknown||DemoOrderDate.fromWire(event.date).precision===OrderDatePrecision.Unknown)))return AftercareIssue.Unknown;
    if(this.result.execute(order).outcome!==DemoResultOutcome.Approved||order.shipment!==ShipmentStatus.Delivered)return AftercareIssue.Ineligible;
    if(records.some(row=>!row.stage.terminal&&row.stage!==ReturnStage.Refunded))return AftercareIssue.Active;
    if(order.lines.every((_,index)=>this.available(snapshot,order,index)<=0))return AftercareIssue.Exhausted;
    return AftercareIssue.None;
  }
  available(snapshot:DemoSnapshot,order:DemoOrder,index:number):number {
    return order.lines[index].quantity-snapshot.aftercare.returns.filter(row=>row.orderId===order.id&&row.outcome.consumes).flatMap(row=>row.lines).filter(line=>line.index===index).reduce((sum,line)=>sum+line.quantity,0);
  }
}
export class ValidateReturnProposalStep {
  private readonly eligibility=new AftercareEligibilityStep();
  invalidQuantityIndexes(snapshot:DemoSnapshot,order:DemoOrder,quantities:readonly number[]):number[]{if(quantities.length!==order.lines.length)return order.lines.map((_,index)=>index);const invalid=quantities.flatMap((qty,index)=>!Number.isSafeInteger(qty)||qty<0||qty>this.eligibility.available(snapshot,order,index)?[index]:[]);return invalid.length?invalid:quantities.some(qty=>qty>0)?[]:[0];}
  execute(snapshot:DemoSnapshot,order:DemoOrder,proposal:ReturnProposal):ReturnLine[] {
    const issue=this.eligibility.execute(snapshot,order);if(issue!==AftercareIssue.None)throw new Error(issue.label);
    if(proposal.reason===ReturnReason.Unknown)throw new Error(AftercareIssue.Reason.label);
    if(!proposal.id||this.invalidQuantityIndexes(snapshot,order,proposal.quantities).length)throw new Error(AftercareIssue.Quantity.label);
    return proposal.quantities.flatMap((quantity,index)=>quantity?[{index,sku:order.lines[index].sku,variant:order.lines[index].variant??DemoProductVariant.Standard,unit:order.lines[index].unit,quantity}]:[]);
  }
}
export class SubmitReturnStep {
  private readonly select=new SelectAftercareOrderStep();private readonly validate=new ValidateReturnProposalStep();
  execute(snapshot:DemoSnapshot,authority:AftercareAuthority,proposal:ReturnProposal,date:string):boolean {
    const order=this.select.execute(snapshot,proposal.orderId,authority),existing=snapshot.aftercare.returns.find(row=>row.id===proposal.id);
    if(existing){const quantities=order.lines.map((_,index)=>existing.lines.find(line=>line.index===index)?.quantity??0);if(existing.orderId!==order.id||existing.actorId!==authority.actorId||existing.reason!==proposal.reason||JSON.stringify(quantities)!==JSON.stringify(proposal.quantities))throw new Error(AftercareIssue.Conflict.label);return false;}
    const lines=this.validate.execute(snapshot,order,proposal),record:ReturnRecord={id:proposal.id,orderId:order.id,actorId:authority.actorId,reason:proposal.reason,lines,stage:ReturnStage.Submitted,outcome:ReturnOutcome.Pending,refund:{status:RefundStatus.None,amount:0},events:[{id:proposal.id,stage:ReturnStage.Submitted,date}]};
    const candidate={returns:[...snapshot.aftercare.returns,record],incidents:snapshot.aftercare.incidents};snapshot.aftercare=AftercareCodec.fromWire(candidate,snapshot.orders);snapshot.revision++;return true;
  }
}
export class CancelSubmittedStep {
  private readonly select=new SelectAftercareOrderStep();
  permits(snapshot:DemoSnapshot,order:DemoOrder,record:ReturnRecord):boolean {return new AftercareEligibilityStep().execute(snapshot,order)===AftercareIssue.Active&&record.stage.canCancel&&record.outcome===ReturnOutcome.Pending&&record.refund.status===RefundStatus.None&&record.reason!==ReturnReason.Unknown&&!record.lines.some(line=>line.variant===DemoProductVariant.Unknown);}
  execute(snapshot:DemoSnapshot,authority:AftercareAuthority,orderId:string,id:string,date:string):boolean {
    const order=this.select.execute(snapshot,orderId,authority),record=snapshot.aftercare.returns.find(row=>row.id===id&&row.orderId===order.id&&row.actorId===authority.actorId);if(!record)throw new Error(AftercareIssue.Authority.label);
    if(record.stage===ReturnStage.Cancelled&&record.outcome===ReturnOutcome.Cancelled)return false;
    if(!this.permits(snapshot,order,record))throw new Error(AftercareIssue.Conflict.label);
    const changed={...record,stage:ReturnStage.Cancelled,outcome:ReturnOutcome.Cancelled,events:[...record.events,{id:record.id+'-cancel',stage:ReturnStage.Cancelled,date}]};
    snapshot.aftercare=AftercareCodec.fromWire({returns:snapshot.aftercare.returns.map(row=>row===record?changed:row),incidents:snapshot.aftercare.incidents},snapshot.orders);snapshot.revision++;return true;
  }
}
export class SubmitIncidentStep {
  private readonly select=new SelectAftercareOrderStep();private readonly present=new PresentResultStep();
  execute(snapshot:DemoSnapshot,authority:AftercareAuthority,orderId:string,id:string,reason:IncidentReason,message:string,date:string):boolean {
    const order=this.select.execute(snapshot,orderId,authority);if(this.present.execute(order).outcome!==DemoResultOutcome.Approved)throw new Error(AftercareIssue.Ineligible.label);
    if(reason===IncidentReason.Unknown)throw new Error(AftercareIssue.Reason.label);if(message.trim().length<3||message.length>1000)throw new Error(AftercareIssue.IncidentMessage.label);
    const existing=snapshot.aftercare.incidents.find(row=>row.id===id);if(existing){if(existing.orderId!==orderId||existing.actorId!==authority.actorId||existing.reason!==reason||existing.message!==message.trim())throw new Error(AftercareIssue.Conflict.label);return false;}
    snapshot.aftercare=AftercareCodec.fromWire({returns:snapshot.aftercare.returns,incidents:[...snapshot.aftercare.incidents,{id,orderId,actorId:authority.actorId,reason,status:IncidentStatus.Submitted,message:message.trim(),date}]},snapshot.orders);snapshot.revision++;return true;
  }
}
export class RefundSummaryStep {
  execute(order:DemoOrder,records:readonly ReturnRecord[]) {
    if(order.returned)return{status:RefundStatus.Unknown,amount:null,remaining:null};
    const relevant=records.filter(row=>row.orderId===order.id),amount=relevant.reduce((sum,row)=>sum+row.refund.amount,0),goods=returnAmount(order.lines.map((line,index)=>({...line,index,variant:line.variant??DemoProductVariant.Standard})));
    const status=relevant.some(row=>row.refund.status===RefundStatus.Unknown||row.stage===ReturnStage.Unknown||row.outcome===ReturnOutcome.Unknown||row.events.some(event=>event.stage===ReturnStage.Unknown||DemoOrderDate.fromWire(event.date).precision===OrderDatePrecision.Unknown))?RefundStatus.Unknown:amount>0?amount<goods?RefundStatus.PartiallyRefunded:RefundStatus.Refunded:relevant.some(row=>row.refund.status===RefundStatus.Pending)?RefundStatus.Pending:RefundStatus.None;
    return{status,amount,remaining:goods-amount};
  }
}
