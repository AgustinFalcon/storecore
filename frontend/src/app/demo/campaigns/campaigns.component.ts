import {Component,DestroyRef,ElementRef,HostListener,afterRenderEffect,computed,effect,inject,signal,viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {DemoApplicationState} from '../demo-state';
import type {CatalogAuthority} from '../admin-catalog/catalog-flow';
import {demoMoney} from '../demo-money';
import {trapDemoDialogFocus} from '../demo-dialog-focus';
import {CampaignPhase,CampaignCommand,CampaignActivation,CampaignApproval,CampaignRevisionStatus,CampaignIssue,CampaignError} from './campaign-types';
import {CampaignRecordPolicy,type DemoCampaignRecord} from './campaign-record';
import {CampaignDraft} from './campaign-draft';
import {CampaignQuery,CampaignLifecycleFilter,CampaignApprovalFilter,CampaignRevisionFilter,CampaignHistoryFilter} from './campaign-query';
import {CampaignsPresenter} from './campaign-presenter';
import {CampaignInstant,SnapshotOfferClock} from './campaign-clock';
import {AuthorizeCampaignsStep,SaveCampaignDraftStep,ApproveCampaignRevisionStep,SetCampaignActivationStep,ProjectCampaignPreviewStep,ValidateCampaignApprovalStep,campaignFingerprint,campaignEnvironmentFingerprint} from './campaign-flow';

@Component({selector:'sc-demo-campaigns',imports:[FormsModule,RouterLink],templateUrl:'./campaigns.component.html',styleUrls:['../demo.scss','./campaigns.component.scss']})
export class DemoCampaignsComponent {
 readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroy=inject(DestroyRef);
 readonly criteria=toSignal(this.route.queryParamMap.pipe(map(params=>CampaignQuery.fromWire({q:params.get('q'),lifecycle:params.get('lifecycle'),approval:params.get('approval'),revisionStatus:params.get('revisionStatus'),page:params.get('page')}))),{initialValue:CampaignQuery.fromWire({})});
 readonly view=computed(()=>new CampaignsPresenter().execute(this.state.data,this.readAuthority,this.criteria()));
 readonly reference=computed(()=>this.allowed?new SnapshotOfferClock(()=>this.state.data.offerReference).capture():CampaignInstant.Unknown);
 readonly Phase=CampaignPhase;readonly Command=CampaignCommand;readonly Activation=CampaignActivation;readonly Approval=CampaignApproval;readonly Revision=CampaignRevisionStatus;readonly Issue=CampaignIssue;
 readonly lifecycleFilters=CampaignLifecycleFilter.all;readonly approvalFilters=CampaignApprovalFilter.all;readonly revisionFilters=CampaignRevisionFilter.all;readonly historyFilters=CampaignHistoryFilter.all;readonly historyFilter=signal(CampaignHistoryFilter.All);readonly trap=trapDemoDialogFocus;
 readonly savedId=signal('');
 readonly before=computed(()=>{const row=this.candidate();return this.allowed&&row?this.state.data.campaignRecords.find(value=>value.id===row.id)??this.state.data.campaignRecords.find(value=>value.id===row.revisesId)??null:null;});
 readonly phase=signal<CampaignPhase|null>(null);readonly issue=signal(CampaignIssue.None);readonly error=signal('');readonly feedback=signal('');readonly candidate=signal<DemoCampaignRecord|null>(null);readonly command=signal(CampaignCommand.Unknown);readonly family=signal('');readonly discarding=signal(false);readonly pendingFocus=signal('');
 readonly lines=computed(()=>this.allowed&&this.candidate()?new ProjectCampaignPreviewStep().execute(this.state.data,this.candidate()!):[]);
 readonly history=computed(()=>this.allowed?this.state.data.campaignRecords.filter(row=>row.familyId===this.family()&&[CampaignRevisionStatus.Superseded,CampaignRevisionStatus.Stale].includes(row.revisionStatus)):[]);
 readonly visibleHistory=computed(()=>this.history().filter(row=>!this.historyFilter().value||row.revisionStatus===this.historyFilter().value));
 private readonly pendingControl=signal<{id:string;cta:string;name:string}|null>(null);private discardOrigin:{id:string;cta:string;name:string}|null=null;
 private readonly heading=viewChild<ElementRef<HTMLElement>>('campaignHeading');private readonly modal=viewChild<ElementRef<HTMLDialogElement>>('campaignModal');
 buffer:CampaignDraft|null=null;private initial='';private actor='';private epoch=-1;private environment='';private expected:string|null=null;private restore:HTMLElement|null=null;private contextKey='';private headingKey='';private decision:{promise:Promise<boolean>;resolve:(leave:boolean)=>void}|null=null;
 get readAuthority():CatalogAuthority{return{context:this.state.context(),role:this.state.role(),actor:this.state.actorId(),expectedActor:this.state.actorId(),epoch:this.state.sessionEpoch(),expectedEpoch:this.state.sessionEpoch(),readable:this.state.authorizationAvailable};}
 get authority():CatalogAuthority{return{...this.readAuthority,expectedActor:this.actor,expectedEpoch:this.epoch};}
 get allowed(){return new AuthorizeCampaignsStep().permits(this.readAuthority,this.state.data);}
 get writable(){return this.allowed&&this.state.writerStatus().writable;}
 get dirty(){return !!this.buffer&&JSON.stringify(this.buffer)!==this.initial;}
 get supersededCount(){return this.history().filter(row=>row.revisionStatus===CampaignRevisionStatus.Superseded).length;}
 get staleCount(){return this.history().filter(row=>row.revisionStatus===CampaignRevisionStatus.Stale).length;}
 changeHistoryFilter(raw:string){this.historyFilter.set(CampaignHistoryFilter.fromWire(raw));}
 selectFamily(id:string){if(!this.allowed)return;this.historyFilter.set(CampaignHistoryFilter.All);this.family.set(id);if(id)sessionStorage.setItem('storecore.demo.campaign-family',id);else sessionStorage.removeItem('storecore.demo.campaign-family');}
 get products(){return this.allowed?this.state.data.products:[];}
 editable(row:DemoCampaignRecord){return new CampaignRecordPolicy().editable(row);}
 date(raw:string){return CampaignInstant.fromWire(raw).label;}
 money(amount:number|null){return amount===null?'Importe no disponible':demoMoney(amount);}
 update(key:string,value:string){void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.criteria().query,[key]:value||null,page:null}});}
 clear(){void this.router.navigate([],{relativeTo:this.route,queryParams:{}});}
 showSaved(){const id=this.savedId();if(!this.allowed||!id)return;void this.router.navigate([],{relativeTo:this.route,queryParams:{q:id}}).then(()=>{if(!this.destroy.destroyed&&this.allowed)this.pendingFocus.set(id);});}
 page(page:number){void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.criteria().query,page:page?String(page+1):null}});}
 private capture(row?:DemoCampaignRecord){this.restore=document.activeElement instanceof HTMLElement?document.activeElement:null;this.actor=this.state.actorId();this.epoch=this.state.sessionEpoch();this.environment=campaignEnvironmentFingerprint(this.state.data);this.expected=row?campaignFingerprint(row):null;this.issue.set(CampaignIssue.None);this.error.set('');this.feedback.set('');}
 edit(row?:DemoCampaignRecord){if(!this.writable||row&&!this.editable(row))return;this.capture(row);this.buffer=new CampaignDraft(row);this.initial=JSON.stringify(this.buffer);this.command.set(CampaignCommand.SaveDraft);this.phase.set(CampaignPhase.Editing);this.pendingFocus.set('campaign-title');}
 previewDraft(){if(!this.current()||!this.buffer)return;try{const row=this.buffer.record();new CampaignRecordPolicy().validate(row);this.candidate.set(row);this.phase.set(CampaignPhase.Preview);this.pendingFocus.set('campaign-dialog-title');}catch(error){this.fail(error);}}
 preview(row:DemoCampaignRecord){if(!this.allowed)return;this.capture(row);this.buffer=null;this.candidate.set(new CampaignRecordPolicy().clone(row));this.command.set(CampaignCommand.Unknown);this.phase.set(CampaignPhase.Preview);this.pendingFocus.set('campaign-dialog-title');}
 openCommand(row:DemoCampaignRecord,command:CampaignCommand){if(!this.writable||!this.editable(row))return;this.capture(row);this.buffer=null;this.candidate.set(new CampaignRecordPolicy().clone(row));this.command.set(command);try{if(command===CampaignCommand.Approve||command===CampaignCommand.Resume)new ValidateCampaignApprovalStep().execute(this.state.data,row,this.reference());this.phase.set(CampaignPhase.Confirming);this.pendingFocus.set('campaign-dialog-title');}catch(error){this.phase.set(CampaignPhase.Preview);this.fail(error);}}
 review(){if(!this.current()||!this.candidate())return;this.phase.set(CampaignPhase.Confirming);this.pendingFocus.set('campaign-dialog-title');}
 confirm(){if(!this.current()||this.phase()!==CampaignPhase.Confirming||!this.candidate())return;const row=this.candidate()!,command=this.command();this.phase.set(CampaignPhase.Saving);const ok=this.state.run(()=>{if(!this.current())throw new CampaignError(CampaignIssue.Authority);if(command===CampaignCommand.SaveDraft)new SaveCampaignDraftStep().execute(this.state.data,this.authority,row,this.expected,this.environment);else if(command===CampaignCommand.Approve)new ApproveCampaignRevisionStep().execute(this.state.data,this.authority,row.id,this.expected!,this.environment);else new SetCampaignActivationStep().execute(this.state.data,this.authority,row.id,command,this.expected!,this.environment);},'Registro editorial guardado. No cambia precios, stock ni publica en la tienda.');if(!this.current())return;if(ok){this.close();this.savedId.set(row.id);this.pendingFocus.set('campaign-show-saved');this.feedback.set(command===CampaignCommand.SaveDraft?'Borrador guardado sin aprobación.':'Decisión editorial simulada guardada.');}else{this.issue.set(CampaignIssue.PersistenceFailure);this.error.set(this.issue().label);this.state.error.set(this.issue().label);this.phase.set(this.buffer?CampaignPhase.Editing:CampaignPhase.Preview);this.environment=campaignEnvironmentFingerprint(this.state.data);this.pendingFocus.set('campaign-error');}}
 private current(){if(this.destroy.destroyed||!new AuthorizeCampaignsStep().permits(this.authority,this.state.data)||!this.state.writerStatus().writable){this.invalidate();return false;}return true;}
 private fail(error:unknown){this.issue.set(error instanceof CampaignError?error.issue:CampaignIssue.Shape);this.error.set(this.issue().label);this.pendingFocus.set(this.phase()===CampaignPhase.Editing?this.issue().field:'campaign-error');}
 back(){if(this.buffer){this.phase.set(CampaignPhase.Editing);this.pendingFocus.set('campaign-title');}else this.close();}
 private beginDiscard(){const active=document.activeElement;this.discardOrigin=active instanceof HTMLElement?{id:active.id,cta:active.getAttribute('data-cta')??'',name:active.getAttribute('name')??''}:null;this.discarding.set(true);this.pendingFocus.set('campaign-dialog-title');}
 requestClose(){if(this.discarding()){this.discarding.set(false);this.pendingControl.set(this.discardOrigin);this.discardOrigin=null;this.pendingFocus.set(this.phase()===CampaignPhase.Editing?'campaign-title':'campaign-dialog-title');this.resolve(false);return;}if(this.dirty)this.beginDiscard();else this.close();}
 discard(){this.close();this.resolve(true);}
 canLeave():boolean|Promise<boolean>{if(!this.allowed||this.epoch!==this.state.sessionEpoch()||this.actor!==this.state.actorId()){this.invalidate();return true;}if(!this.dirty)return true;if(this.decision)return this.decision.promise;let resolve!:(leave:boolean)=>void;const promise=new Promise<boolean>(done=>resolve=done);this.decision={promise,resolve};this.beginDiscard();return promise;}
 private resolve(leave:boolean){const decision=this.decision;this.decision=null;decision?.resolve(leave);}
 private close(){this.modal()?.nativeElement.close();this.phase.set(null);this.discarding.set(false);this.buffer=null;this.candidate.set(null);this.initial='';this.error.set('');this.pendingFocus.set('');this.pendingControl.set(null);this.discardOrigin=null;if(this.restore?.isConnected)this.restore.focus();}
 private invalidate(preserveFamily=false){if(!preserveFamily)sessionStorage.removeItem('storecore.demo.campaign-family');this.restore=null;this.close();this.actor='';this.epoch=-1;this.environment='';this.expected=null;this.command.set(CampaignCommand.Unknown);this.family.set('');this.savedId.set('');this.feedback.set('');this.issue.set(CampaignIssue.None);this.resolve(true);}
 @HostListener('document:keydown.escape',['$event']) escape(event:Event){if(this.phase()){event.preventDefault();this.requestClose();}}
 @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent){if(this.allowed&&this.dirty){event.preventDefault();event.returnValue='';}}
 constructor(){if(this.allowed)this.family.set(sessionStorage.getItem('storecore.demo.campaign-family')??'');effect(()=>{const key=this.state.actorId()+':'+this.state.sessionEpoch()+':'+this.allowed;if(this.contextKey&&key!==this.contextKey)this.invalidate();this.contextKey=key;});afterRenderEffect(()=>{const key=this.state.sessionEpoch()+':'+this.allowed;if(key!==this.headingKey&&this.heading()){this.headingKey=key;this.heading()!.nativeElement.focus();}const modal=this.modal()?.nativeElement;if(modal&&!modal.open)modal.showModal();const id=this.pendingFocus();if(id){const target=document.getElementById(id);if(target){target.focus();this.pendingFocus.set('');}}const control=this.pendingControl();if(control&&modal&&!this.discarding()){const target=[...modal.querySelectorAll<HTMLElement>('[id],[data-cta],[name]')].find(el=>control.id?el.id===control.id:control.cta?el.getAttribute('data-cta')===control.cta:control.name?el.getAttribute('name')===control.name:false);if(target){target.focus();this.pendingControl.set(null);}else this.pendingControl.set(null);}});this.destroy.onDestroy(()=>{this.restore=null;this.invalidate(true);});}
}
