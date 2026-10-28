import { DemoContext,DemoProductVariant,demoSeed,decodeSnapshot } from '../demo-model';
import { PaymentStatus,ShipmentStatus } from '../../domain/order/commerce-states';
import { CustomerAccountState } from '../customers/customer-account';
import { AftercareCodec } from './aftercare-ledger';
import { AftercareIssue,ReturnStage,ReturnOutcome,ReturnReason,RefundStatus,IncidentReason,IncidentStatus } from './aftercare-types';
import { AftercareEligibilityStep,CancelSubmittedStep,SubmitReturnStep,SubmitIncidentStep,type AftercareAuthority } from './aftercare-flow';
import { DemoAftercarePresenter } from './aftercare-presenter';

const authority:AftercareAuthority={context:DemoContext.Customer,actorId:'customer-2209',epoch:1,expectedEpoch:1};
const proposal=()=>({id:'request-test',orderId:'ORD-1015',reason:ReturnReason.Damaged,quantities:[1]});
describe('SC14 closed aftercare aggregate',()=>{
  it('does not infer aggregate refunded/remaining money or eligible quantities from legacy returned=true',()=>{const snapshot=demoSeed();snapshot.aftercare={returns:[],incidents:[]};snapshot.orders.find(order=>order.id==='ORD-1015')!.returned=true;const view=new DemoAftercarePresenter().execute(snapshot,'ORD-1015',DemoContext.Customer,authority.actorId)!;expect(view.eligibility).toBe(AftercareIssue.Legacy);expect(view.refund.status).toBe(RefundStatus.Unknown);expect(view.refund.amount).toBeNull();expect(view.refund.remaining).toBeNull();expect(view.lines[0].available).toBeNull();expect(view.canRequest).toBe(false);});
  it('closure preserves the recorded terminal outcome instead of inventing a refund after rejection',()=>{
    for(const entry of [{stage:ReturnStage.Rejected,outcome:ReturnOutcome.Rejected},{stage:ReturnStage.Cancelled,outcome:ReturnOutcome.Cancelled},{stage:ReturnStage.Refunded,outcome:ReturnOutcome.Accepted}]){const snapshot=demoSeed(),row=snapshot.aftercare.returns[0];row.stage=ReturnStage.Closed;row.outcome=entry.outcome;row.refund=entry.outcome===ReturnOutcome.Accepted?{status:RefundStatus.Refunded,amount:8450000}:{status:RefundStatus.None,amount:0};row.events=[{id:'first',stage:entry.stage,date:'2026-10-16'},{id:'close',stage:ReturnStage.Closed,date:'2026-10-17'}];expect(()=>decodeSnapshot(JSON.stringify(snapshot))).not.toThrow();row.outcome=entry.outcome===ReturnOutcome.Accepted?ReturnOutcome.Rejected:ReturnOutcome.Accepted;row.refund=row.outcome===ReturnOutcome.Accepted?{status:RefundStatus.Refunded,amount:8450000}:{status:RefundStatus.None,amount:0};expect(()=>decodeSnapshot(JSON.stringify(snapshot))).toThrow('decisión');}
  });
  it('blocks exhausted quantities and rejects regression/backdated histories while unknown history is read-only',()=>{
    const snapshot=demoSeed(),row=snapshot.aftercare.returns[0];row.lines[0].quantity=2;row.refund.amount=16900000;const view=new DemoAftercarePresenter().execute(decodeSnapshot(JSON.stringify(snapshot)),'ORD-1015',DemoContext.Customer,authority.actorId)!;expect(view.eligibility).toBe(AftercareIssue.Exhausted);expect(view.canRequest).toBe(false);expect(view.refund.remaining).toBe(0);
    row.lines[0].quantity=1;row.refund={status:RefundStatus.None,amount:0};row.stage=ReturnStage.Submitted;row.outcome=ReturnOutcome.Pending;row.events=[{id:'a',stage:ReturnStage.Refunded,date:'2026-10-20'},{id:'b',stage:ReturnStage.Submitted,date:'2026-10-19'}];expect(()=>decodeSnapshot(JSON.stringify(snapshot))).toThrow('secuencia');
    row.stage=ReturnStage.Review;row.events=[{id:'a',stage:ReturnStage.Submitted,date:'2026-10-20'},{id:'b',stage:ReturnStage.Review,date:'2026-10-19'}];expect(()=>decodeSnapshot(JSON.stringify(snapshot))).toThrow('fechas');
    row.stage=ReturnStage.Submitted;row.events=[{id:'a',stage:ReturnStage.Unknown,date:'2026-10-19'},{id:'b',stage:ReturnStage.Submitted,date:'2026-10-20'}];const restored=decodeSnapshot(JSON.stringify(snapshot)),before=JSON.stringify(restored);expect(new CancelSubmittedStep().permits(restored,restored.orders.find(order=>order.id==='ORD-1015')!,restored.aftercare.returns[0])).toBe(false);expect(()=>new CancelSubmittedStep().execute(restored,authority,'ORD-1015',row.id,'2026-10-21')).toThrow();expect(JSON.stringify(restored)).toBe(before);
  });
  it('translates every finite case and unsupported input exactly once',()=>{for(const type of [ReturnStage,ReturnOutcome,ReturnReason,RefundStatus,IncidentReason,IncidentStatus]){for(const value of type.all)expect(type.fromWire(value.wire)).toBe(value);for(const value of [undefined,null,'invented'])expect(type.fromWire(value)).toBe(type.Unknown);}});
  it('migrates v1–v3 absence only, rejects v4 missing/null/malformed, and never invents historical returns',()=>{
    for(const version of [1,2,3]){const raw=JSON.parse(JSON.stringify(demoSeed()));raw.version=version;delete raw.aftercare;const restored=decodeSnapshot(JSON.stringify(raw));expect(restored.version).toBe(4);expect(restored.aftercare).toEqual({returns:[],incidents:[]});expect(raw.aftercare).toBeUndefined();}
    for(const value of [undefined,null,{},[],{returns:null,incidents:[]}]){const raw={...demoSeed(),aftercare:value};expect(()=>decodeSnapshot(JSON.stringify(raw))).toThrow();}
    for(const version of [1,2,3])expect(()=>decodeSnapshot(JSON.stringify({...demoSeed(),version,aftercare:null}))).toThrow();
  });
  it('round-trips partial refund independently of approved payment and freezes all financial/stock facts on reads',()=>{
    const snapshot=decodeSnapshot(JSON.stringify(demoSeed())),before=JSON.stringify(snapshot),view=new DemoAftercarePresenter().execute(snapshot,'ORD-1015',DemoContext.Customer,authority.actorId)!;
    expect(view.refund.status).toBe(RefundStatus.PartiallyRefunded);expect(view.refund.amount).toBe(8450000);expect(view.refund.remaining).toBe(8450000);expect(view.order.payment).toBe(PaymentStatus.Approved);expect(view.lines[0].available).toBe(1);expect(JSON.stringify(snapshot)).toBe(before);
    expect(new DemoAftercarePresenter().execute(snapshot,'ORD-1015',DemoContext.Admin,authority.actorId)).toBeNull();expect(new DemoAftercarePresenter().execute(snapshot,'ORD-1015',DemoContext.Customer,'cliente')).toBeNull();
  });
  it('submits/cancels partial quantities idempotently without changing orders, inventory, payment or reservation',()=>{
    const snapshot=demoSeed(),before=JSON.stringify({orders:snapshot.orders,products:snapshot.products,movements:snapshot.movements}),submit=new SubmitReturnStep(),cancel=new CancelSubmittedStep();
    expect(submit.execute(snapshot,authority,proposal(),'2026-10-28T12:00:00Z')).toBe(true);const revision=snapshot.revision;
    expect(submit.execute(snapshot,authority,proposal(),'2026-10-29T12:00:00Z')).toBe(false);expect(snapshot.revision).toBe(revision);expect(()=>submit.execute(snapshot,authority,{...proposal(),reason:ReturnReason.Different},'x')).toThrow(AftercareIssue.Conflict.label);
    expect(new AftercareEligibilityStep().available(snapshot,snapshot.orders.find(order=>order.id==='ORD-1015')!,0)).toBe(0);
    expect(cancel.execute(snapshot,authority,'ORD-1015',proposal().id,'2026-10-28T12:01:00Z')).toBe(true);const cancelledRevision=snapshot.revision;expect(cancel.execute(snapshot,authority,'ORD-1015',proposal().id,'x')).toBe(false);expect(snapshot.revision).toBe(cancelledRevision);expect(snapshot.aftercare.returns.at(-1)?.stage).toBe(ReturnStage.Cancelled);expect(snapshot.aftercare.returns.at(-1)?.events).toHaveLength(2);
    expect(JSON.stringify({orders:snapshot.orders,products:snapshot.products,movements:snapshot.movements})).toBe(before);expect(()=>decodeSnapshot(JSON.stringify(snapshot))).not.toThrow();
  });
  it('rejects invalid quantities, actor/epoch/restricted context and legacy whole returns without writes',()=>{
    for(const quantities of [[0],[2],[-1],[0.5],[Infinity],[]]){const snapshot=demoSeed(),before=JSON.stringify(snapshot);expect(()=>new SubmitReturnStep().execute(snapshot,authority,{...proposal(),quantities},'x')).toThrow();expect(JSON.stringify(snapshot)).toBe(before);}
    for(const identity of [{...authority,context:DemoContext.Admin},{...authority,context:DemoContext.Unknown},{...authority,actorId:'cliente'},{...authority,epoch:2}])expect(()=>new SubmitReturnStep().execute(demoSeed(),identity,proposal(),'x')).toThrow();
    const snapshot=demoSeed();snapshot.orders.find(order=>order.id==='ORD-1015')!.returned=true;expect(()=>new SubmitReturnStep().execute(snapshot,authority,proposal(),'x')).toThrow(AftercareIssue.Legacy.label);snapshot.orders.find(order=>order.id==='ORD-1015')!.returned=false;snapshot.actors.find(actor=>actor.id===authority.actorId)!.access!.state=CustomerAccountState.Restricted;expect(()=>new SubmitReturnStep().execute(snapshot,authority,proposal(),'x')).toThrow();
  });
  it('rejects duplicate/mismatched/over-consumed lines, forged actor and excessive or inconsistent refund',()=>{
    const good=demoSeed();for(const mutate of [(raw:typeof good)=>raw.aftercare.returns[0].lines[0].quantity=3,(raw:typeof good)=>raw.aftercare.returns[0].lines[0].unit=1,(raw:typeof good)=>raw.aftercare.returns[0].lines[0].sku='DEMO-001',(raw:typeof good)=>raw.aftercare.returns[0].actorId='cliente',(raw:typeof good)=>raw.aftercare.returns[0].refund.amount++,(raw:typeof good)=>raw.aftercare.returns[0].lines.push({...raw.aftercare.returns[0].lines[0]}),(raw:typeof good)=>raw.aftercare.returns.push({...raw.aftercare.returns[0],id:'duplicate-consumption',lines:[{...raw.aftercare.returns[0].lines[0],quantity:2}]})]){const raw=demoSeed();mutate(raw);expect(()=>decodeSnapshot(JSON.stringify(raw))).toThrow();}
    expect(()=>AftercareCodec.fromWire({returns:[],incidents:null},good.orders)).toThrow();
  });
  it('Unknown and advanced states are read-only; closed preserves rejected vs accepted quantities',()=>{
    const snapshot=demoSeed(),row=snapshot.aftercare.returns[0];row.stage=ReturnStage.Closed;row.events[0].stage=ReturnStage.Closed;expect(decodeSnapshot(JSON.stringify(snapshot)).aftercare.returns[0].outcome).toBe(ReturnOutcome.Accepted);
    row.stage=ReturnStage.Rejected;row.events[0].stage=ReturnStage.Rejected;row.outcome=ReturnOutcome.Rejected;row.refund={status:RefundStatus.None,amount:0};expect(new DemoAftercarePresenter().execute(decodeSnapshot(JSON.stringify(snapshot)),'ORD-1015',DemoContext.Customer,authority.actorId)?.lines[0].available).toBe(2);
    row.stage=ReturnStage.Unknown;row.events[0].stage=ReturnStage.Unknown;const restored=decodeSnapshot(JSON.stringify(snapshot));expect(new DemoAftercarePresenter().execute(restored,'ORD-1015',DemoContext.Customer,authority.actorId)?.eligibility).toBe(AftercareIssue.Unknown);expect(()=>new CancelSubmittedStep().execute(restored,authority,'ORD-1015',row.id,'x')).toThrow();
  });
  it('only approved coherent delivered orders can return; incident belongs to exact customer and is idempotent',()=>{
    for(const payment of [PaymentStatus.Pending,PaymentStatus.Rejected,PaymentStatus.Cancelled,PaymentStatus.Unknown]){const snapshot=demoSeed();snapshot.orders.find(order=>order.id==='ORD-1015')!.payment=payment;expect(()=>new SubmitReturnStep().execute(snapshot,authority,proposal(),'x')).toThrow();}
    const snapshot=demoSeed(),incident=new SubmitIncidentStep();expect(incident.execute(snapshot,authority,'ORD-1015','inquiry',IncidentReason.Delivery,'Mi consulta','2026-10-28')).toBe(true);const revision=snapshot.revision;expect(incident.execute(snapshot,authority,'ORD-1015','inquiry',IncidentReason.Delivery,'Mi consulta','x')).toBe(false);expect(snapshot.revision).toBe(revision);expect(()=>incident.execute(snapshot,authority,'ORD-1015','inquiry',IncidentReason.Product,'Otro','x')).toThrow();
    expect(()=>decodeSnapshot(JSON.stringify(snapshot))).not.toThrow();snapshot.orders.find(order=>order.id==='ORD-1015')!.shipment=ShipmentStatus.Preparing;expect(()=>new SubmitReturnStep().execute(snapshot,authority,proposal(),'x')).toThrow();
    expect(snapshot.aftercare.returns[0].lines[0].variant).toBe(DemoProductVariant.Standard);
  });
});
