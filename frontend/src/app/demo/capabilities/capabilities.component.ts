import { Component, DestroyRef, ElementRef, Injector, ViewChild, afterNextRender, effect, inject, signal, type AfterRenderRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DemoModuleId } from '../demo-model';
import { DemoApplicationState } from '../demo-state';
import { DemoPageComponent } from '../demo.component';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState as Status } from '../../domain/user/capability-module-state';
import { ModuleAvailability } from '../../domain/user/module-availability';
import { DeliveryLevel } from '../../domain/user/delivery-level';
import { commercialCapabilityCards, CommercialCapabilityId, type CommercialCapabilityCard } from '../../features/admin/user-capabilities.catalog';
import { CapabilityTab as Tab, CapabilityCommandPhase as Phase, CapabilityLedgerCodec, CapabilityProposalCodec, CapabilityOperationFilter, ReviewCapabilityStep, type CapabilityProposal } from './capability-ledger';
import { trapDemoDialogFocus } from '../demo-dialog-focus';

@Component({selector:'sc-demo-capabilities',imports:[FormsModule,RouterLink,DemoPageComponent],templateUrl:'./capabilities.component.html',styleUrls:['../../features/admin/user-capabilities.view.scss','./capabilities.component.scss']})
export class DemoCapabilitiesComponent {
  readonly state=inject(DemoApplicationState);
  private readonly route=inject(ActivatedRoute);
  private readonly router=inject(Router);
  private readonly injector=inject(Injector);
  private pendingRender:AfterRenderRef|null=null;
  private authorityKey=this.authority();
  private authority(){return JSON.stringify([this.state.actorId(),this.state.sessionEpoch(),this.state.role().wire,this.state.context().wire,this.state.sessionGeneration()]);}
  private clearPending(){try{sessionStorage.removeItem('storecore.demo.capability-pending');}catch{ /* no write may be inferred from session storage */ }}
  private focusPhase(open=false){
    this.pendingRender?.destroy();const authority=this.authority();
    this.pendingRender=afterNextRender(()=>{
      this.pendingRender=null;if(authority!==this.authority()||!this.state.canReadCapabilities)return;
      const dialog=this.dialog?.nativeElement;if(!dialog)return;
      if(open&&!dialog.open)dialog.showModal();
      if(dialog.open)dialog.querySelector<HTMLElement>('#cap-dialog-title')?.focus();
    },{injector:this.injector});
  }
  readonly Tab=Tab;readonly Phase=Phase;readonly Status=Status;
  readonly tab=signal(Tab.Modules);readonly phase=signal(Phase.Editing);
  readonly trapFocus=trapDemoDialogFocus;
  readonly states=CapabilityOperationFilter.values;
  readonly availabilities=[ModuleAvailability.Available,ModuleAvailability.Deferred,ModuleAvailability.DependencyBlocked,ModuleAvailability.Unknown];
  readonly deliveries=[DeliveryLevel.Integrated,DeliveryLevel.IntegrationReady,DeliveryLevel.DesignApproved,DeliveryLevel.DemoApproved,DeliveryLevel.Unknown];
  query='';status=CapabilityOperationFilter.All;availability:ModuleAvailability|null=null;delivery:DeliveryLevel|null=null;
  recoveryChecked=false;
  reason='';proposal:CapabilityProposal|null=null;information:CommercialCapabilityCard|null=null;error='';
  @ViewChild('dialog') dialog?:ElementRef<HTMLDialogElement>;
  opener:HTMLElement|null=null;
  constructor(){
    inject(DestroyRef).onDestroy(()=>this.pendingRender?.destroy());
    try{this.proposal=CapabilityProposalCodec.fromWire(JSON.parse(sessionStorage.getItem('storecore.demo.capability-pending')??'null'));if(this.proposal&&this.state.canWriteCapabilities&&this.proposal.actor===this.state.actorId()&&this.proposal.sessionGeneration===this.state.sessionGeneration()){this.reason=this.proposal.reason;this.phase.set(Phase.Uncertain);}else{this.proposal=null;this.clearPending();}}catch{this.proposal=null;}
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params=>{const tab=Tab.fromWire(params.get('tab'));this.tab.set(tab===Tab.Technical&&!this.state.canWriteCapabilities?Tab.Modules:tab);if(tab===Tab.Technical&&!this.state.canWriteCapabilities)void this.router.navigate([],{relativeTo:this.route,queryParams:{tab:Tab.Modules.wire},queryParamsHandling:'merge',replaceUrl:true});});
    effect(()=>{const authority=this.authority();if(authority!==this.authorityKey){this.authorityKey=authority;this.clearPending();this.reason='';this.proposal=null;this.information=null;this.phase.set(Phase.Unauthorized);this.close();}if(!this.state.canWriteCapabilities&&this.tab()===Tab.Technical){this.tab.set(Tab.Modules);void this.router.navigate([],{relativeTo:this.route,queryParams:{tab:Tab.Modules.wire},queryParamsHandling:'merge',replaceUrl:true});}if(!this.state.canReadCapabilities)this.close();});
  }
  get operable(){return this.state.canWriteCapabilities&&[Status.Active,Status.Paused].includes(this.ledger.state)&&this.ledger.configVersion!==null&&Number.isSafeInteger(this.ledger.configVersion);}
  get needsRecovery(){return this.proposal!==null&&[Phase.Conflict,Phase.Uncertain].includes(this.phase());}
  get ledger(){return this.state.data.capabilities??CapabilityLedgerCodec.baseline();}
  get cards(){if(!this.state.canReadCapabilities)return [];return commercialCapabilityCards([{id:CapabilityModuleId.Catalog,state:this.ledger.state,configVersion:this.ledger.configVersion},{id:CapabilityModuleId.MarketplaceMl,state:Status.Unknown,configVersion:null}]).map(card=>{const technical=this.state.data.modules.filter(row=>row.id===DemoModuleId.Catalog),ownerBlocked=[CommercialCapabilityId.Catalog,CommercialCapabilityId.Outlet].includes(card.id)&&(technical.length!==1||!technical[0].enabled);return{...card,ownerBlocked,ownerPath:!ownerBlocked&&card.ownerPath?'/demo'+card.ownerPath:null};});}
  get visible(){const query=this.query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();return this.cards.filter(card=>(!query||[card.name,card.summary,card.category].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query))&&this.status.matches(card.serverModule?.state??null)&&(!this.availability||card.availability===this.availability)&&(!this.delivery||card.delivery===this.delivery));}
  get availableCount(){return this.cards.filter(c=>c.availability===ModuleAvailability.Available).length;}
  clear(){this.query='';this.status=CapabilityOperationFilter.All;this.availability=null;this.delivery=null;}
  selectTab(tab:Tab){void this.router.navigate([],{relativeTo:this.route,queryParams:{tab:tab.wire},queryParamsHandling:'merge'});}
  show(card:CommercialCapabilityCard){this.information=card;this.open();}
  review(){if(!this.state.canWriteCapabilities||(!this.recoveryChecked&&[Phase.Conflict,Phase.Uncertain].includes(this.phase())))return;try{this.proposal=new ReviewCapabilityStep().execute(this.ledger,this.state.actorId(),this.state.sessionEpoch(),this.reason,crypto.randomUUID(),this.state.sessionGeneration());this.recoveryChecked=false;this.phase.set(Phase.Reviewing);this.error='';this.information=null;this.open();}catch(error){this.error=error instanceof Error?error.message:'No se pudo preparar la propuesta.';}}
  confirm(){if(this.phase()!==Phase.Reviewing||!this.proposal)return;if(this.reason.trim()!==this.proposal.reason){this.phase.set(Phase.Editing);return;}try{sessionStorage.setItem('storecore.demo.capability-pending',JSON.stringify(this.proposal));}catch{this.phase.set(Phase.Failed);this.focusPhase();return;}this.phase.set(Phase.Saving);this.phase.set(this.state.applyCapability(this.proposal));if(!this.needsRecovery)this.clearPending();this.focusPhase();}
  recover(){if(!this.proposal)return;this.phase.set(this.state.recoverCapability(this.proposal));this.recoveryChecked=this.phase()!==Phase.Uncertain;if(this.phase()===Phase.AlreadyApplied)this.clearPending();this.focusPhase();}
  resume(){this.information=null;this.open();}
  restoreFocus(){const recovery=this.needsRecovery?document.getElementById('cap-recover'):null;(recovery??this.opener)?.focus();}
  close(){this.pendingRender?.destroy();this.pendingRender=null;if(!this.information&&this.phase()===Phase.Reviewing){this.proposal=null;this.phase.set(Phase.Editing);this.clearPending();}this.dialog?.nativeElement.close();this.restoreFocus();}
  private open(){this.opener=document.activeElement instanceof HTMLElement?document.activeElement:null;this.focusPhase(true);}
}
