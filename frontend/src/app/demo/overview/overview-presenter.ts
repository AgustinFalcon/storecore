import { UserRole } from '../../domain/user/user-role';
import { PaymentStatus,ShipmentStatus } from '../../domain/order/commerce-states';
import { DemoContext,DemoModuleId,type DemoOrder,type DemoSnapshot } from '../demo-model';
import { CustomerAccountState } from '../customers/customer-account';
import { PresentResultStep,DemoResultOutcome } from '../checkout/demo-checkout-result';
import { DemoMoney } from '../checkout/demo-money';
import { DemoOrderDate } from '../orders/demo-order-date';
import { ReturnStage,RefundStatus,IncidentStatus,IncidentReason,AftercareIssue } from '../aftercare/aftercare-types';
import { RefundSummaryStep,AftercareEligibilityStep } from '../aftercare/aftercare-flow';
import { OverviewAccess,OverviewAction,OverviewRange,OverviewTaskKind,overviewDateKnown } from './overview-types';

export interface OverviewOrder {readonly order:DemoOrder;readonly date:DemoOrderDate;readonly customer:string;readonly outcome:DemoResultOutcome;readonly task:OverviewTaskKind|null;}
export interface OverviewAuthority {readonly context:DemoContext;readonly role:UserRole;readonly readable:boolean;}
export class AuthorizeOverviewStep {execute(authority:OverviewAuthority):OverviewAccess{return OverviewAccess.resolve(authority.context,authority.role,authority.readable);}}
export class SelectOverviewPeriodStep {
  execute(orders:readonly OverviewOrder[],range:OverviewRange,reference:DemoOrderDate):readonly OverviewOrder[]{return orders.filter(row=>range.includes(row.date,reference));}
}
export class ProjectOverviewOrdersStep {
  private readonly result=new PresentResultStep();
  execute(snapshot:DemoSnapshot):OverviewOrder[]{return snapshot.orders.map(order=>{
    const outcome=this.result.execute(order).outcome;
    const task=order.incident?OverviewTaskKind.Incident:[DemoResultOutcome.Review,DemoResultOutcome.Unknown].includes(outcome)?OverviewTaskKind.Review:outcome===DemoResultOutcome.Pending?OverviewTaskKind.Pending:outcome===DemoResultOutcome.Approved&&order.shipment===ShipmentStatus.Preparing?OverviewTaskKind.Prepare:outcome===DemoResultOutcome.Approved&&order.shipment===ShipmentStatus.Shipped?OverviewTaskKind.Shipping:null;
    const actor=snapshot.actors.find(actor=>actor.id===order.actor);
    return{order,date:DemoOrderDate.fromWire(order.createdDate),customer:actor?[actor.firstName,actor.lastName].filter(Boolean).join(' '):'Cliente no disponible',outcome,task};
  }).sort((left,right)=>left.date.compareNewest(right.date));}
}
export class ProjectOverviewMetricsStep {
  execute(rows:readonly OverviewOrder[]){
    const approved=rows.filter(row=>row.outcome===DemoResultOutcome.Approved);let amount:number|null=0;
    try{for(const row of approved)amount=DemoMoney.add(amount!,row.order.total);}catch{amount=null;}
    return{count:rows.length,approved:approved.length,amount,review:rows.filter(row=>[DemoResultOutcome.Review,DemoResultOutcome.Unknown].includes(row.outcome)).length,payments:[PaymentStatus.Approved,PaymentStatus.Pending,PaymentStatus.Rejected,PaymentStatus.Cancelled,PaymentStatus.Refunded,PaymentStatus.ChargedBack,PaymentStatus.Unknown].map(status=>({status,count:rows.filter(row=>row.order.payment===status).length}))};
  }
}
export class ProjectOverviewCurrentWorkStep {
  execute(snapshot:DemoSnapshot,rows:readonly OverviewOrder[]){
    const threshold=snapshot.settings.lowStockThreshold,validThreshold=Number.isSafeInteger(threshold)&&threshold>=0;
    const stock=snapshot.products.filter(product=>product.active).map(product=>({product,available:Number.isSafeInteger(product.onHand)&&Number.isSafeInteger(product.reserved)&&product.onHand>=product.reserved&&product.reserved>=0?product.onHand-product.reserved:null}));
    const returns=snapshot.aftercare.returns.filter(row=>![ReturnStage.Cancelled,ReturnStage.Closed,ReturnStage.Rejected,ReturnStage.Refunded].includes(row.stage));
    const incidents=snapshot.aftercare.incidents.filter(row=>row.status!==IncidentStatus.Closed);
    const summary=new RefundSummaryStep(),eligibility=new AftercareEligibilityStep();
    const refundRows=snapshot.orders.map(order=>({summary:summary.execute(order,snapshot.aftercare.returns),unknown:order.returned||eligibility.execute(snapshot,order)===AftercareIssue.Unknown}));
    const unknownAftercare=refundRows.filter(row=>row.unknown||row.summary.status===RefundStatus.Unknown).length+incidents.filter(row=>row.status===IncidentStatus.Unknown||row.reason===IncidentReason.Unknown||!overviewDateKnown(DemoOrderDate.fromWire(row.date))).length;
    let refunded:number|null=0;try{for(const row of refundRows){if(row.unknown||row.summary.status===RefundStatus.Unknown||row.summary.amount===null){refunded=null;break;}refunded=DemoMoney.add(refunded!,row.summary.amount);}}catch{refunded=null;}
    return{tasks:rows.filter(row=>row.task!==null).sort((left,right)=>(left.task?.priority??5)-(right.task?.priority??5)),pending:rows.filter(row=>row.outcome===DemoResultOutcome.Pending).length,legacyIncidents:rows.filter(row=>!!row.order.incident).length,stock,lowStock:validThreshold?stock.filter(row=>row.available!==null&&row.available>0&&row.available<threshold):[],outOfStock:stock.filter(row=>row.available===0),stockUnknown:stock.filter(row=>row.available===null).length,threshold:validThreshold?threshold:null,activeProducts:stock.length,accounts:[CustomerAccountState.Active,CustomerAccountState.Restricted,CustomerAccountState.Unknown].map(status=>({status,count:snapshot.actors.filter(actor=>(actor.access?.state??CustomerAccountState.Unknown)===status).length})),returns,incidents,unknownAftercare,refunded,syncErrors:snapshot.listings.filter(row=>row.error).length,competitorAlerts:snapshot.competitors.filter(row=>row.unread).length};
  }
}
export class DemoOverviewPresenter {
  private readonly authorize=new AuthorizeOverviewStep();private readonly project=new ProjectOverviewOrdersStep();private readonly select=new SelectOverviewPeriodStep();private readonly metrics=new ProjectOverviewMetricsStep();private readonly current=new ProjectOverviewCurrentWorkStep();
  execute(snapshot:DemoSnapshot,authority:OverviewAuthority,range:OverviewRange,reference:DemoOrderDate){
    if(this.authorize.execute(authority)!==OverviewAccess.Allowed)return null;
    const rows=this.project.execute(snapshot),validPeriod=range!==OverviewRange.Unknown&&overviewDateKnown(reference),selected=validPeriod?this.select.execute(rows,range,reference):[];
    return{range,reference,validPeriod,metrics:validPeriod?this.metrics.execute(selected):null,current:this.current.execute(snapshot,rows),recent:rows.slice(0,5),selected,unknownDates:rows.filter(row=>!overviewDateKnown(row.date)).length,totalOrders:rows.length,actions:OverviewAction.all.filter(action=>action.permits(authority.role,snapshot)),orderLinks:OverviewAction.orderPermitted(authority.role,snapshot),paused:DemoModuleId.all.filter(id=>!OverviewAction.moduleEnabled(snapshot,id))};
  }
}
