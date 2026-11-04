import {Component,ElementRef,afterRenderEffect,effect,inject,signal,untracked,viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {InventoryReturnComponent} from '../inventory/inventory-return.component';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {DemoApplicationState} from '../demo-state';
import {DemoSnapshotConflict} from '../catalog/catalog-types';
import {demoMoney} from '../demo-money';
import {trapDemoDialogFocus} from '../demo-dialog-focus';
import {DemoOrderDate} from '../orders/demo-order-date';
import {RefundSummaryStep,AftercareEligibilityStep} from '../aftercare/aftercare-flow';
import {returnAmount,ReturnRecordPolicy} from '../aftercare/aftercare-ledger';
import {ReturnCommandResult,ReturnReason,ReturnDisposition,RefundStatus} from '../aftercare/aftercare-types';
import {AuthorizeDemoOrdersStep,orderCommands,type OrderAuthority,type DemoOrderCommand,type OrderIntent} from './order-flow';
import {OrderQueueAxis} from './order-query';
import {DemoAftercareState,OrderLinePresentation} from './order-types';
import {DemoBrowserEffects} from './demo-browser-effects';
import {OperationalReturnFlow,ReturnCaseSection,RequestReturnStep,InspectReturnStep,DisposeReturnStep,OrderReturnDestination,ResolveOperationalIncidentStep,type OperationalReturnStep,type ReturnCommand} from './order-detail-flow';

export class DetailDialog {
 private constructor(readonly label:string){}
 static readonly Return=new DetailDialog('Confirmar operación de devolución');static readonly Delivery=new DetailDialog('Confirmar entrega');static readonly Incident=new DetailDialog('Resolver incidencia operativa');static readonly Receipt=new DetailDialog('Comprobante Demo · no fiscal');
}
@Component({selector:'sc-demo-order-detail',imports:[InventoryReturnComponent,FormsModule,RouterLink],templateUrl:'./order-detail.component.html',styleUrls:['../demo.scss','./order-detail.component.scss']})
export class DemoOrderDetailComponent {
 readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly browser=inject(DemoBrowserEffects);
 readonly id=toSignal(this.route.paramMap.pipe(map(p=>p.get('id')??'')),{initialValue:''});
 readonly query=toSignal(this.route.queryParamMap.pipe(map(p=>Object.fromEntries(['q','focus',...OrderQueueAxis.all.map(a=>a.wire)].map(k=>[k,p.get(k)])))),{initialValue:{}});
 readonly axes=OrderQueueAxis.all;readonly money=demoMoney;readonly date=DemoOrderDate.fromWire;readonly amount=returnAmount;readonly trap=trapDemoDialogFocus;
 readonly flow=new OperationalReturnFlow();readonly Result=ReturnCommandResult;readonly Dialog=DetailDialog;readonly reasons=ReturnReason.all;readonly dispositions=ReturnDisposition.all;
 readonly dialog=signal<DetailDialog|null>(null);readonly result=signal(ReturnCommandResult.Editing);readonly feedback=signal('');readonly error=signal('');readonly ready=signal(false);
 readonly reason=signal(ReturnReason.Unknown);readonly disposition=signal(ReturnDisposition.Unknown);readonly quantities=signal<number[]>([]);readonly observation=signal('');readonly notes=signal('');readonly tracking=signal('');
 readonly step=signal<OperationalReturnStep|null>(null);readonly delivery=signal<DemoOrderCommand|null>(null);
 readonly refreshed=signal(false);
 private readonly reviewFocus=signal(false);private readonly reviewHeading=viewChild<ElementRef<HTMLElement>>('reviewHeading');
 private readonly editFocus=signal(false);private readonly editorHeading=viewChild<ElementRef<HTMLElement>>('editorHeading');
 private intent:ReturnCommand|null=null;private deliveryIntent:OrderIntent|null=null;private trigger:HTMLElement|null=null;
 private readonly modal=viewChild<ElementRef<HTMLDialogElement>>('modal');private readonly heading=viewChild<ElementRef<HTMLElement>>('heading');private readonly restore=signal(false);
 get authority():OrderAuthority{return{context:this.state.context(),role:this.state.role(),actor:this.state.actorId(),epoch:this.state.sessionEpoch(),readable:this.state.authorizationAvailable};}
 get allowed(){return new AuthorizeDemoOrdersStep().permits(this.authority);}
 get order(){return this.allowed?this.state.data.orders.find(order=>order.id===this.id())??null:null;}
 get destination(){return OrderReturnDestination.fromWire(this.query(),this.id());}
 get buyer(){const order=this.order;if(!order)return null;return this.state.data.actors.find(a=>a.id===order.actor)??null;}
 get records(){const order=this.order;return order?this.state.data.aftercare.returns.filter(r=>r.orderId===order.id):[];}
 get activeRecord(){return this.intent?this.records.find(record=>record.id===this.intent?.recordId)??null:null;}
 get activeCase(){const order=this.order;return order?this.flow.active(this.state.data,order):null;}
 get caseSections(){return ReturnCaseSection.project(this.records,this.activeCase);}
 get requestedLines(){return this.order?.lines.flatMap((line,index)=>this.quantities()[index]>0?[{...line,quantity:this.quantities()[index],subtotal:line.unit*this.quantities()[index],presentation:OrderLinePresentation.project(line)}]:[])??[];}
 get requestedTotal(){return this.requestedLines.reduce((total,line)=>total+line.subtotal,0);}
 readonly presentation=(line:Parameters<typeof OrderLinePresentation.project>[0])=>OrderLinePresentation.project(line);
 get known(){const order=this.order;return !!order&&this.axes.every(axis=>axis.values.includes(axis.read(this.state.data,order)))&&this.records.every(record=>ReturnRecordPolicy.known(record));}
 progress(step:OperationalReturnStep){const record=this.activeCase;return step.progress(record?[record]:[],this.next).label;}
 get refund(){const order=this.order;return order?new RefundSummaryStep().execute(order,this.records):null;}
 get next(){const order=this.order;return order?this.flow.next(this.state.data,order):null;}
 get logistics(){const order=this.order;return order?orderCommands.find(command=>command.permits(this.state.data,order))??null:null;}
 get canResolveIncident(){const order=this.order;return !!order&&new ResolveOperationalIncidentStep().permits(this.state.data,order);}
 get isRequest(){return this.step() instanceof RequestReturnStep;}get isInspect(){return this.step() instanceof InspectReturnStep;}get isDispose(){return this.step() instanceof DisposeReturnStep;}
 available(index:number){const order=this.order;return order?new AftercareEligibilityStep().available(this.state.data,order,index):0;}
 aftercare(){const order=this.order;return order?DemoAftercareState.label(this.state.data,order):'';}
 refundedUnits(){return this.refund?.status===RefundStatus.Unknown?null:this.records.filter(r=>r.refund.amount>0).flatMap(r=>r.lines).reduce((sum,line)=>sum+line.quantity,0);}
 availableUnits(){return this.refund?.status===RefundStatus.Unknown?null:this.order?.lines.reduce((sum,_line,index)=>sum+this.available(index),0)??0;}
 recordKnown(record:Parameters<typeof ReturnRecordPolicy.known>[0]){return ReturnRecordPolicy.known(record);}
 setQuantity(index:number,value:number){const next=[...this.quantities()];next[index]=value;this.quantities.set(next);}
 setReason(raw:unknown){this.reason.set(ReturnReason.fromWire(raw));}setDisposition(raw:unknown){this.disposition.set(ReturnDisposition.fromWire(raw));}
 retryRead(){this.browser.retryRead();}
 private capture(dialog:DetailDialog){this.trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;this.error.set('');this.feedback.set('');this.result.set(ReturnCommandResult.Editing);this.refreshed.set(false);this.dialog.set(dialog);}
 openReturn(){const order=this.order,step=this.next;if(!order||!step||!this.state.writerStatus().writable)return;this.capture(DetailDialog.Return);this.step.set(step);this.reason.set(ReturnReason.Unknown);this.disposition.set(ReturnDisposition.Unknown);this.observation.set('');this.notes.set('');this.quantities.set(order.lines.map(()=>0));const record=this.records.find(r=>r.stage===step.origin);this.intent={id:crypto.randomUUID(),recordId:record?.id??'RETURN-'+crypto.randomUUID(),orderId:order.id,actor:this.authority.actor,epoch:this.authority.epoch,revision:this.state.data.revision,reason:this.reason(),quantities:this.quantities(),observation:'',internalNotes:'',disposition:this.disposition()};}
 openDelivery(){const order=this.order,command=this.logistics;if(!order||!command||!this.state.writerStatus().writable)return;this.capture(DetailDialog.Delivery);this.delivery.set(command);this.tracking.set(order.tracking);this.deliveryIntent={id:order.id,actor:this.authority.actor,epoch:this.authority.epoch,revision:this.state.data.revision,fingerprint:JSON.stringify(order),tracking:order.tracking};}
 openIncident(){if(!this.canResolveIncident)return;this.capture(DetailDialog.Incident);this.deliveryIntent={id:this.id(),actor:this.authority.actor,epoch:this.authority.epoch,revision:this.state.data.revision,fingerprint:'',tracking:''};}
 receipt(){if(this.order)this.capture(DetailDialog.Receipt);}
 edit(){if(!this.allowed||!this.dialog())return;this.result.set(ReturnCommandResult.Editing);this.editFocus.set(true);}
 review(){if(!this.allowed)return;if(this.isRequest&&(!ReturnReason.all.includes(this.reason())||!this.quantities().some(q=>q>0)||this.quantities().some((q,i)=>!Number.isSafeInteger(q)||q<0||q>this.available(i)))){this.error.set('Elegí un motivo y cantidades enteras dentro del saldo disponible.');return;}if(this.isInspect&&(!this.observation().trim()||this.observation().length>1000||this.notes().length>1000)){this.error.set('Ingresá una observación de hasta 1000 caracteres.');return;}if(this.isDispose&&!ReturnDisposition.all.includes(this.disposition())){this.error.set('Elegí una disposición.');return;}if(this.delivery()?.requiresTracking&&!this.tracking().trim()){this.error.set('Ingresá el tracking manual.');return;}this.error.set('');this.result.set(ReturnCommandResult.Reviewing);this.reviewFocus.set(true);}
 confirm(){const intent=this.intent??this.deliveryIntent;if(!intent)return;if(!this.allowed||intent.actor!==this.authority.actor||intent.epoch!==this.authority.epoch||('orderId'in intent?intent.orderId:intent.id)!==this.id()){this.invalidate();return;}if(this.result()!==ReturnCommandResult.Reviewing)return;this.result.set(ReturnCommandResult.Saving);let outcome=ReturnCommandResult.Unknown;
  const ok=this.state.run(()=>{if(!this.allowed||intent.actor!==this.authority.actor||intent.epoch!==this.authority.epoch||('orderId'in intent?intent.orderId:intent.id)!==this.id()){outcome=ReturnCommandResult.Unauthorized;throw outcome;}if(this.dialog()===DetailDialog.Return&&this.intent&&this.step()){this.intent={...this.intent,reason:this.reason(),quantities:this.quantities(),observation:this.observation(),internalNotes:this.notes(),disposition:this.disposition()};outcome=this.step()!.execute(this.state.data,this.authority,this.intent,new Date().toISOString());}else if(this.dialog()===DetailDialog.Delivery&&this.deliveryIntent&&this.delivery()){outcome=this.delivery()!.execute(this.state.data,this.authority,{...this.deliveryIntent,tracking:this.tracking()})?ReturnCommandResult.Applied:ReturnCommandResult.AlreadyApplied;}else if(this.dialog()===DetailDialog.Incident&&this.deliveryIntent){outcome=new ResolveOperationalIncidentStep().execute(this.state.data,this.authority,this.deliveryIntent);}if(![ReturnCommandResult.Applied,ReturnCommandResult.AlreadyApplied].includes(outcome))throw outcome;},'Operación guardada en esta Demo.',failure=>{if([ReturnCommandResult.Unknown,ReturnCommandResult.Applied,ReturnCommandResult.AlreadyApplied].includes(outcome))outcome=!this.state.writerStatus().writable?ReturnCommandResult.Blocked:failure instanceof DemoSnapshotConflict?ReturnCommandResult.Conflict:ReturnCommandResult.Failed;});
  if(ok){this.result.set(outcome);this.feedback.set(outcome.label);this.close();}else{this.state.error.set('');this.result.set([ReturnCommandResult.Unknown,ReturnCommandResult.Applied,ReturnCommandResult.AlreadyApplied].includes(outcome)?ReturnCommandResult.Failed:outcome);this.error.set(this.result().label);}
 }
 reviewCurrent(){const intent=this.intent??this.deliveryIntent;if(!intent)return;if(!this.allowed||intent.actor!==this.authority.actor||intent.epoch!==this.authority.epoch)return;if(!this.state.reloadOrderSnapshot(intent.actor,intent.epoch)){this.error.set('No se pudo actualizar el pedido. Conservamos tu propuesta.');return;}if(this.intent)this.intent={...this.intent,revision:this.state.data.revision};if(this.deliveryIntent){const order=this.order;if(order)this.deliveryIntent={...this.deliveryIntent,revision:this.state.data.revision,fingerprint:JSON.stringify(order)};}this.refreshed.set(true);this.error.set('Estado actualizado. Revisá tu propuesta y volvé a confirmar.');this.edit();}
 close(){this.modal()?.nativeElement.close();this.dialog.set(null);this.intent=null;this.deliveryIntent=null;this.step.set(null);this.delivery.set(null);this.restore.set(true);}
 private invalidate(){this.close();this.quantities.set([]);this.observation.set('');this.notes.set('');this.reason.set(ReturnReason.Unknown);this.disposition.set(ReturnDisposition.Unknown);this.feedback.set('');this.error.set('');this.result.set(ReturnCommandResult.Editing);}
 constructor(){effect(()=>{this.id();this.state.actorId();this.state.sessionEpoch();this.state.context();this.state.role();untracked(()=>this.invalidate());this.ready.set(true);});afterRenderEffect(()=>{const modal=this.modal()?.nativeElement;if(modal&&!modal.open){modal.showModal();modal.querySelector<HTMLElement>('input,textarea,select,button')?.focus();}if(this.reviewFocus()&&this.result()===ReturnCommandResult.Reviewing){this.reviewHeading()?.nativeElement.focus();this.reviewFocus.set(false);}if(this.editFocus()&&this.result()===ReturnCommandResult.Editing){this.editorHeading()?.nativeElement.focus();this.editFocus.set(false);}if(this.restore()&&!this.dialog()){if(this.trigger?.isConnected)this.trigger.focus();else this.heading()?.nativeElement.focus();this.restore.set(false);}});}
}
