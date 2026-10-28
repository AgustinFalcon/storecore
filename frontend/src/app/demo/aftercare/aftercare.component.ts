import { Component,DestroyRef,ElementRef,HostListener,Injector,afterNextRender,afterRenderEffect,computed,effect,inject,signal,viewChild } from '@angular/core';
import { ActivatedRoute,Router,RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DemoApplicationState } from '../demo-state';
import { DemoContext,DemoProductVariant } from '../demo-model';
import { PaymentStatus } from '../../domain/order/commerce-states';
import { demoMoney } from '../demo-money';
import { trapDemoDialogFocus } from '../demo-dialog-focus';
import { OrderHistoryCriteria } from '../orders/demo-order-history';
import { DemoReturnDestination } from '../identity/demo-return-destination';
import { DemoResultOutcome } from '../checkout/demo-checkout-result';
import { DemoAftercarePresenter,safeReceipt } from './aftercare-presenter';
import { CancelSubmittedStep,SubmitIncidentStep,SubmitReturnStep,ValidateReturnProposalStep,type AftercareAuthority,type ReturnProposal } from './aftercare-flow';
import { returnAmount } from './aftercare-ledger';
import { AftercareDialog,AftercareFormStep,AftercareIssue,AftercareSuccessTarget,IncidentReason,ReturnReason,ReturnStage } from './aftercare-types';

@Component({selector:'sc-demo-aftercare',imports:[FormsModule,RouterLink],templateUrl:'./aftercare.component.html',styleUrls:['../demo.scss','./aftercare.component.scss']})
export class DemoAftercareComponent {
  readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly injector=inject(Injector);private readonly destroy=inject(DestroyRef);
  private readonly presenter=new DemoAftercarePresenter();private readonly submit=new SubmitReturnStep();private readonly cancel=new CancelSubmittedStep();private readonly incident=new SubmitIncidentStep();private readonly validate=new ValidateReturnProposalStep();
  readonly orderId=toSignal(this.route.paramMap.pipe(map(params=>params.get('id'))),{initialValue:this.route.snapshot.paramMap.get('id')});
  readonly criteria=toSignal(this.route.queryParamMap.pipe(map(params=>OrderHistoryCriteria.fromWire({q:params.get('q'),payment:params.get('payment'),page:params.get('page')}))),{initialValue:OrderHistoryCriteria.fromWire({})});
  readonly view=computed(()=>this.presenter.execute(this.state.data,this.orderId(),this.allowed?DemoContext.Customer:DemoContext.Unknown,this.state.actorId()));
  readonly Dialog=AftercareDialog;readonly Step=AftercareFormStep;readonly Issue=AftercareIssue;readonly Outcome=DemoResultOutcome;readonly Payment=PaymentStatus;readonly ReturnStage=ReturnStage;
  readonly reasons=ReturnReason.all;readonly incidentReasons=IncidentReason.all;readonly trapFocus=trapDemoDialogFocus;
  readonly dialog=signal(AftercareDialog.None);readonly step=signal(AftercareFormStep.Edit);readonly issue=signal(AftercareIssue.None);readonly error=signal('');readonly announcement=signal('');
  readonly reason=signal(ReturnReason.Unknown);readonly incidentReason=signal(IncidentReason.Delivery);readonly quantities=signal<number[]>([]);message='';
  readonly incidentAnnouncement=signal('');private readonly successTarget=signal(AftercareSuccessTarget.Return);private readonly inquiriesHeading=viewChild<ElementRef<HTMLElement>>('inquiriesHeading');
  private draftId='';private draftOrder='';private draftEpoch=0;private selectedReturn='';private restore:HTMLElement|null=null;private lastContext='';private focusedKey='';private readonly success=signal(0);private focusedSuccess=0;private readonly pendingFocus=signal('');
  private readonly heading=viewChild<ElementRef<HTMLElement>>('orderHeading');private readonly statusHeading=viewChild<ElementRef<HTMLElement>>('statusHeading');
  get allowed():boolean{return this.state.authorizationAvailable&&this.state.context()===DemoContext.Customer;}
  get writable():boolean{return this.allowed&&this.state.writerStatus().writable;}
  get returnQuery():{returnUrl:string}{return{returnUrl:DemoReturnDestination.fromWire(this.router.url).url};}
  get proposal():ReturnProposal{return{id:this.draftId,orderId:this.draftOrder,reason:this.reason(),quantities:this.quantities()};}
  get cancellation(){return this.view()?.returns.find(row=>row.id===this.selectedReturn);}
  get selectedAmount():number {const order=this.view()?.order;if(!order)return 0;try{return returnAmount(order.lines.flatMap((line,index)=>this.quantities()[index]>0?[{...line,index,variant:line.variant??DemoProductVariant.Standard,quantity:this.quantities()[index]}]:[]));}catch{return 0;}}
  get authority():AftercareAuthority{return{context:this.state.context(),actorId:this.state.actorId(),epoch:this.state.sessionEpoch(),expectedEpoch:this.draftEpoch};}
  money(value:number|null):string{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?demoMoney(value):'Importe no disponible';}
  setReason(raw:string):void{this.reason.set(ReturnReason.fromWire(raw));}
  setIncidentReason(raw:string):void{this.incidentReason.set(IncidentReason.fromWire(raw));}
  quantity(index:number,raw:number):void{this.quantities.update(values=>values.map((value,position)=>position===index?Number(raw):value));}
  quantityInvalid(index:number):boolean{const order=this.view()?.order;return this.issue()===AftercareIssue.Quantity&&!!order&&this.validate.invalidQuantityIndexes(this.state.data,order,this.quantities()).includes(index);}
  @HostListener('document:keydown.escape',['$event']) escape(event:Event):void{if(this.dialog()!==AftercareDialog.None){event.preventDefault();this.close();}}
  open(kind:AftercareDialog,id=''):void {
    const view=this.view();if(!view)return;if([AftercareDialog.Return,AftercareDialog.Cancel,AftercareDialog.Incident,AftercareDialog.PaymentCancel].includes(kind)&&!this.writable)return;
    this.restore=document.activeElement instanceof HTMLElement?document.activeElement:null;this.draftOrder=view.order.id;this.draftEpoch=this.state.sessionEpoch();this.draftId=crypto.randomUUID();this.selectedReturn=id;this.quantities.set(view.order.lines.map(()=>0));this.reason.set(ReturnReason.Unknown);this.incidentReason.set(IncidentReason.Delivery);this.message='';this.error.set('');this.issue.set(AftercareIssue.None);this.step.set(AftercareFormStep.Edit);this.dialog.set(kind);
    const epoch=this.draftEpoch,token=this.draftId;afterNextRender(()=>{if(this.destroy.destroyed||this.dialog()!==kind||token!==this.draftId||epoch!==this.state.sessionEpoch()||this.orderId()!==this.draftOrder)return;document.querySelector<HTMLDialogElement>('#aftercare-dialog')?.showModal();},{injector:this.injector});
  }
  close(restore=true):void{document.querySelector<HTMLDialogElement>('#aftercare-dialog')?.close();this.dialog.set(AftercareDialog.None);this.pendingFocus.set('');this.error.set('');if(restore&&this.restore?.isConnected)this.restore.focus();}
  review():void {try{const view=this.view();if(!view||!this.writable)throw new Error(AftercareIssue.Authority.label);this.validate.execute(this.state.data,view.order,this.proposal);this.issue.set(AftercareIssue.None);this.error.set('');this.step.set(AftercareFormStep.Confirm);this.pendingFocus.set('aftercare-review-heading');}catch(error){this.fail(error);}}
  back():void{this.step.set(AftercareFormStep.Edit);this.error.set('');this.pendingFocus.set('aftercare-return-reason');}
  confirmReturn():void {
    if(this.dialog()!==AftercareDialog.Return||this.step()!==AftercareFormStep.Confirm||!this.writable)return;
    if(this.run(()=>this.submit.execute(this.state.data,this.authority,this.proposal,new Date().toISOString()),'Solicitud simulada guardada. No se modificaron el pago ni el stock.'))this.complete('Solicitud de devolución registrada.');
  }
  confirmCancel():void {if(this.dialog()!==AftercareDialog.Cancel||!this.writable)return;if(this.run(()=>this.cancel.execute(this.state.data,this.authority,this.draftOrder,this.selectedReturn,new Date().toISOString()),'Solicitud cancelada. El pedido y el pago no cambiaron.'))this.complete('Solicitud cancelada. Las cantidades vuelven a estar disponibles.');}
  saveIncident():void {if(this.dialog()!==AftercareDialog.Incident||!this.writable)return;if(this.run(()=>this.incident.execute(this.state.data,this.authority,this.draftOrder,this.draftId,this.incidentReason(),this.message,new Date().toISOString()),'Consulta simulada guardada. No se envió ningún mensaje externo.'))this.complete('Consulta registrada en esta demostración.',AftercareSuccessTarget.Incident);}
  private run(action:()=>unknown,message:string):boolean {const ok=this.state.run(()=>{if(!this.writable||this.orderId()!==this.draftOrder||this.draftEpoch!==this.state.sessionEpoch())throw new Error(AftercareIssue.Authority.label);action();},message);if(!ok){this.fail(new Error(this.state.error()));this.step.set(AftercareFormStep.Failure);}return ok;}
  private complete(message:string,target=AftercareSuccessTarget.Return):void{this.close(false);this.successTarget.set(target);if(target===AftercareSuccessTarget.Incident)this.incidentAnnouncement.set(message);else this.announcement.set(message);this.success.update(value=>value+1);}
  private fail(error:unknown):void{const message=error instanceof Error?error.message:'No se pudo validar la solicitud.';const issue=[AftercareIssue.IncidentMessage,AftercareIssue.Reason,AftercareIssue.Quantity,AftercareIssue.Active,AftercareIssue.Legacy,AftercareIssue.Unknown,AftercareIssue.Ineligible,AftercareIssue.Authority].find(value=>value.label===message)??AftercareIssue.Conflict;this.issue.set(issue);this.error.set(message);this.pendingFocus.set(issue===AftercareIssue.IncidentMessage?'aftercare-incident-message':issue===AftercareIssue.Reason?(this.dialog()===AftercareDialog.Incident?'aftercare-incident-reason':'aftercare-return-reason'):issue===AftercareIssue.Quantity?'aftercare-quantity-'+(this.view()?.lines.find(line=>this.quantityInvalid(line.index))?.index??0):'aftercare-error');}
  resolvePayment():void{const view=this.view();if(!view||!this.writable||view.result.outcome!==DemoResultOutcome.Pending)return;this.draftOrder=view.order.id;this.draftEpoch=this.state.sessionEpoch();this.run(()=>this.state.commerce.resolvePayment(this.draftOrder,this.state.scenario()),'Pago simulado actualizado.');}
  cancelPayment():void{if(this.dialog()!==AftercareDialog.PaymentCancel||!this.writable)return;if(this.run(()=>this.state.commerce.cancelPayment(this.draftOrder),'Pago cancelado. Reserva liberada.'))this.close();}
  retryOrder():void {const view=this.view();if(!view||!this.writable||![DemoResultOutcome.Rejected,DemoResultOutcome.Cancelled].includes(view.result.outcome))return;this.draftOrder=view.order.id;this.draftEpoch=this.state.sessionEpoch();if(this.run(()=>{for(const line of view.order.lines)this.state.commerce.add(this.state.actorId(),line.sku,line.quantity,line.variant);},'Productos recuperados en tu carrito.'))void this.router.navigate(['/demo/cart']);}
  receiptText():string{const order=this.view()?.order;return order?safeReceipt(order,value=>this.money(value)):'';}
  downloadReceipt():void{if(!this.view())return;const url=URL.createObjectURL(new Blob([this.receiptText()],{type:'text/plain;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download='comprobante-demo-'+this.orderId()+'.txt';anchor.click();URL.revokeObjectURL(url);}
  printReceipt():void{if(this.view())window.print();}
  constructor(){
    effect(()=>{const key=this.state.sessionEpoch()+':'+this.state.actorId()+':'+this.orderId()+':'+this.allowed;if(this.lastContext&&this.lastContext!==key){this.close(false);this.quantities.set([]);this.message='';this.announcement.set('');this.incidentAnnouncement.set('');this.focusedSuccess=this.success();this.successTarget.set(AftercareSuccessTarget.Return);this.draftId='';this.restore=null;}this.lastContext=key;});
    afterRenderEffect(()=>{const view=this.view(),heading=this.heading()?.nativeElement,key=this.state.actorId()+':'+this.orderId()+':'+(view?.result.outcome.wire??'');if(heading&&this.focusedKey!==key){this.focusedKey=key;heading.focus();}const success=this.success();if(success!==this.focusedSuccess){this.focusedSuccess=success;(this.successTarget()===AftercareSuccessTarget.Incident?this.inquiriesHeading():this.statusHeading())?.nativeElement.focus();}const focus=this.pendingFocus();if(focus){const target=document.getElementById(focus);if(target){target.focus();this.pendingFocus.set('');}}});
    this.destroy.onDestroy(()=>{document.querySelector<HTMLDialogElement>('#aftercare-dialog')?.close();});
  }
}
