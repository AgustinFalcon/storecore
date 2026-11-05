import {Component,ElementRef,afterRenderEffect,effect,inject,signal,untracked,viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {DemoApplicationState} from '../demo-state';
import {DemoSnapshotConflict} from '../catalog/catalog-types';
import {trapDemoDialogFocus} from '../demo-dialog-focus';
import {InventoryOperation,InventoryPhase,InventoryHealth,InventoryValidation} from './inventory-types';
import {InventoryAccess,InventoryPool,physicalStockSteps,type InventoryCommand} from './inventory-flow';
import {InventoryQuery,InventoryDestination} from './inventory-query';
import type {DemoProduct} from '../demo-model';
import {CatalogDetailsRead} from '../rich-catalog/catalog-details';
import {ProductPublication} from '../catalog/catalog-types';
import {DemoBrowserEffects} from '../admin-orders/demo-browser-effects';

@Component({selector:'sc-demo-inventory',imports:[FormsModule,RouterLink],templateUrl:'./inventory.component.html',styleUrls:['../demo.scss','./inventory.component.scss']})
export class DemoInventoryComponent {
 readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);
 private readonly browser=inject(DemoBrowserEffects);
 private readonly returnFocus=toSignal(this.route.queryParamMap.pipe(map(p=>p.get('focus')??'')),{initialValue:''});private focusedDestination='';
 private readonly root=viewChild<ElementRef<HTMLElement>>('root');
 readonly validation=signal(InventoryValidation.None);readonly Validation=InventoryValidation;
 readonly query=toSignal(this.route.queryParamMap.pipe(map(p=>InventoryQuery.fromWire(Object.fromEntries(p.keys.map(key=>[key,p.get(key)]))))),{initialValue:InventoryQuery.fromWire({})});
 readonly phase=signal(InventoryPhase.Editing);readonly Phase=InventoryPhase;readonly operations=InventoryOperation.all;readonly operation=signal(InventoryOperation.Adjust);readonly quantity=signal<number>(1);readonly reason=signal('');readonly reference=signal('');readonly selected=signal('');readonly history=signal(false);readonly feedback=signal('');readonly ready=signal(false);readonly trap=trapDemoDialogFocus;
 private intent:InventoryCommand|null=null;private trigger:HTMLElement|null=null;private readonly restore=signal(false);private readonly focusStage=signal(false);
 private readonly modal=viewChild<ElementRef<HTMLDialogElement>>('modal');private readonly heading=viewChild<ElementRef<HTMLElement>>('heading');private readonly stageHeading=viewChild<ElementRef<HTMLElement>>('stageHeading');
 get authority(){return{context:this.state.context(),role:this.state.role(),actor:this.state.actorId(),epoch:this.state.sessionEpoch(),readable:this.state.authorizationAvailable};}
 get allowed(){return InventoryAccess.permits(this.authority);}
 get rows(){return this.allowed?this.query().execute(this.state.data):[];}get total(){return this.allowed?this.state.data.products.length:0;}get totals(){return this.allowed?InventoryPool.totals(this.state.data):null;}
 get product(){return this.allowed?this.state.data.products.find(p=>p.sku===this.selected())??null:null;}
 get movements(){return this.product?this.state.data.movements.filter(m=>m.sku===this.selected()).map(m=>({...m,order:this.state.data.aftercare.returns.flatMap(r=>r.events.filter(e=>m.id.startsWith(e.id+'-')).map(()=>r.orderId))[0]??this.state.data.orders.find(o=>m.id===o.id+'-'+m.sku)?.id??null})):[];}
 balances(p:DemoProduct){return InventoryPool.balances(this.state.data,p);}health(p:DemoProduct){return InventoryHealth.project(p.active,this.balances(p)?.sellable??null,this.state.data.settings.lowStockThreshold)?.label??'Archivado · no ofrecido';}
 publication(p:DemoProduct){return ProductPublication.fromWire(p.active);}
 retryRead(){this.browser.retryRead();}
 context(p:DemoProduct){const d=CatalogDetailsRead.detail(this.state.data,p.sku);return(d?.kind.label??'Condición desconocida')+' · '+(d?.variants.map(v=>v.variant.label).join(' / ')??'Presentaciones no disponibles')+' · pool único por SKU';}
 catalog(p:DemoProduct){return InventoryDestination.catalog(this.query(),p.sku);}order(id:string){return InventoryDestination.order(this.query(),id,this.selected());}
 get command():InventoryCommand|null{return this.intent?{...this.intent,operation:this.operation(),quantity:this.quantity(),reason:this.reason(),reference:this.reference()}:null;}
 get step(){return physicalStockSteps.find(step=>step.operation===this.operation())??null;}
 get proposed(){const c=this.command;return c&&this.allowed?this.step?.proposal(this.state.data,c)??null:null;}
 get terminal(){return[this.Phase.Applied,this.Phase.AlreadyApplied].includes(this.phase());}
 get recoverable(){return[this.Phase.Conflict,this.Phase.Failed,this.Phase.Blocked].includes(this.phase());}
 filter(key:string,value:string){void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.query().params,[key]:value||null}});}
 clear(){void this.router.navigate([],{relativeTo:this.route,queryParams:{}});}
 setOperation(raw:unknown){this.operation.set(InventoryOperation.fromWire(raw));}
 open(p:DemoProduct,history=false){if(!this.allowed)return;this.trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;this.selected.set(p.sku);this.history.set(history);this.phase.set(InventoryPhase.Editing);this.operation.set(InventoryOperation.Adjust);this.quantity.set(1);this.reason.set('');this.reference.set('');this.feedback.set('');this.intent={id:crypto.randomUUID(),sku:p.sku,operation:this.operation(),quantity:1,reason:'',reference:'',actor:this.authority.actor,epoch:this.authority.epoch,revision:this.state.data.revision};}
 review(){if(!this.validIdentity())return;this.validation.set(InventoryValidation.None);if(!this.query().known||!this.state.writerStatus().writable||!this.product||!this.balances(this.product)){this.phase.set(InventoryPhase.Blocked);this.focusStage.set(true);return;}if(!this.proposed){this.validation.set(InventoryValidation.Invalid);this.phase.set(InventoryPhase.Editing);this.focusStage.set(true);return;}this.phase.set(InventoryPhase.Reviewing);this.focusStage.set(true);}
 edit(){if(!this.validIdentity()||this.terminal)return;this.phase.set(InventoryPhase.Editing);this.focusStage.set(true);}
 confirm(){if(this.terminal)return;if(!this.validIdentity()||this.phase()!==InventoryPhase.Reviewing)return;const command=this.command,step=this.step;if(!command||!step)return;this.phase.set(InventoryPhase.Saving);let result=InventoryPhase.Unknown;
  const ok=this.state.run(()=>{result=step.execute(this.state.data,this.authority,command,new Date().toISOString());if(![InventoryPhase.Applied,InventoryPhase.AlreadyApplied].includes(result))throw result;},'Movimiento guardado en esta Demo.',error=>{if([InventoryPhase.Unknown,InventoryPhase.Applied,InventoryPhase.AlreadyApplied].includes(result))result=!this.state.writerStatus().writable?InventoryPhase.Blocked:error instanceof DemoSnapshotConflict?InventoryPhase.Conflict:InventoryPhase.Failed;});
  this.state.error.set('');this.phase.set(ok?result:result===InventoryPhase.Unknown?InventoryPhase.Failed:result);if(ok)this.feedback.set(result.label);this.focusStage.set(true);
 }
 refresh(){if(!this.validIdentity()||!this.intent||this.terminal)return;if(this.state.reloadOrderSnapshot(this.intent.actor,this.intent.epoch)){this.state.error.set('');this.intent={...this.intent,revision:this.state.data.revision};this.phase.set(InventoryPhase.Editing);this.focusStage.set(true);}else this.phase.set(InventoryPhase.Failed);}
 reload(){if(this.allowed&&this.state.reloadOrderSnapshot(this.authority.actor,this.authority.epoch)){this.state.error.set('');this.feedback.set('Inventario actualizado.');}}
 private validIdentity(){if(!this.intent||!this.allowed||this.intent.actor!==this.authority.actor||this.intent.epoch!==this.authority.epoch||this.intent.sku!==this.selected()){this.invalidate();return false;}return true;}
 close(){this.modal()?.nativeElement.close();this.selected.set('');this.intent=null;this.history.set(false);this.validation.set(InventoryValidation.None);this.restore.set(true);}
 private invalidate(){this.close();this.feedback.set('');this.reason.set('');this.reference.set('');this.phase.set(InventoryPhase.Editing);}
 private focusDestination(){const sku=this.returnFocus();if(!this.ready()||!this.allowed||!sku||this.focusedDestination===sku)return;const target=Array.from(this.root()?.nativeElement.querySelectorAll<HTMLElement>('[data-sku]')??[]).find(row=>row.dataset['sku']===sku)?.querySelector<HTMLElement>('button:not(:disabled)');if(target)target.focus();else this.heading()?.nativeElement.focus();this.focusedDestination=sku;}
 constructor(){effect(()=>{this.state.actorId();this.state.sessionEpoch();this.state.context();this.state.role();untracked(()=>this.invalidate());this.ready.set(true);});afterRenderEffect(()=>{const modal=this.modal()?.nativeElement;if(modal&&!modal.open){modal.showModal();modal.querySelector<HTMLElement>('select,input,button')?.focus();}if(this.focusStage()){this.stageHeading()?.nativeElement.focus();this.focusStage.set(false);}if(this.restore()&&!this.selected()){if(this.trigger?.isConnected)this.trigger.focus();else this.heading()?.nativeElement.focus();this.restore.set(false);}this.focusDestination();});}
}
