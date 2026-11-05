import {Component,ElementRef,afterRenderEffect,computed,effect,inject,signal,viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {DemoApplicationState} from '../demo-state';
import type {DemoOrder} from '../demo-model';
import {demoMoney} from '../demo-money';
import {trapDemoDialogFocus} from '../demo-dialog-focus';
import {AuthorizeDemoOrdersStep,type OrderAuthority,type OrderIntent,type DemoOrderCommand,orderCommands} from './order-flow';
import {OrderQueueQuery,OrderQueueAxis,ExportDemoOrdersStep} from './order-query';
import {DemoAftercareState,DemoOrderOrigin} from './order-types';
import {DemoBrowserEffects} from './demo-browser-effects';
export class OrderDialog {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Export=new OrderDialog('export','Exportar pedidos');static readonly Transition=new OrderDialog('transition','Confirmar transición');static readonly Unknown=new OrderDialog('','Diálogo desconocido');static readonly all=[this.Export,this.Transition];static fromWire(raw:unknown){return this.all.find(x=>x.wire===raw)??this.Unknown;}
}
@Component({selector:'sc-demo-admin-orders',imports:[FormsModule,RouterLink],templateUrl:'./admin-orders.component.html',styleUrls:['../demo.scss','./admin-orders.component.scss']})
export class DemoAdminOrdersComponent {
 readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly browser=inject(DemoBrowserEffects);
 readonly axes=OrderQueueAxis.all;readonly Dialog=OrderDialog;readonly trap=trapDemoDialogFocus;readonly money=demoMoney;
 readonly query=toSignal(this.route.queryParamMap.pipe(map(p=>OrderQueueQuery.fromWire(Object.fromEntries(['q',...OrderQueueAxis.all.map(a=>a.wire)].map(k=>[k,p.get(k)]))))),{initialValue:OrderQueueQuery.fromWire({})});
 get authority():OrderAuthority{return{context:this.state.context(),role:this.state.role(),actor:this.state.actorId(),epoch:this.state.sessionEpoch(),readable:this.state.authorizationAvailable};}
 get allowed(){return new AuthorizeDemoOrdersStep().permits(this.authority);}
 retryRead(){this.browser.retryRead();}
 readonly rows=computed(()=>this.allowed?this.query().execute(this.state.data,this.authority):[]);
 readonly selected=signal<ReadonlySet<string>>(new Set(['ORD-1012','ORD-1019']));readonly dialog=signal<OrderDialog|null>(null);readonly command=signal<DemoOrderCommand|null>(null);readonly proposal=signal('');readonly failure=signal('');readonly saving=signal(false);readonly feedback=signal('');
 private intent:OrderIntent|null=null;private trigger:HTMLElement|null=null;private readonly modal=viewChild<ElementRef<HTMLDialogElement>>('modal');
 private readonly restoreAfterRender=signal<{origin:HTMLElement|null;id:string}|null>(null);
 private readonly queueSearch=viewChild<ElementRef<HTMLInputElement>>('queueSearch');
 private readonly requestedFocus=toSignal(this.route.queryParamMap.pipe(map(params=>params.get('focus'))),{initialValue:null});private focusedTarget:string|null=null;
 readonly fresh=signal<DemoOrder|null>(null);
 get targetId(){return this.allowed?this.intent?.id??'':'';}
 readonly visibleSelected=computed(()=>this.rows().filter(x=>this.selected().has(x.id)).length);
 readonly selectedCount=computed(()=>this.allowed?this.state.data.orders.filter(x=>this.selected().has(x.id)).length:0);
 readonly hiddenSelected=computed(()=>this.selectedCount()-this.visibleSelected());
 origin(order:DemoOrder){return order.origin??DemoOrderOrigin.Unknown;}
 buyer(order:DemoOrder){if(!this.allowed)return '';const a=this.state.data.actors.find(x=>x.id===order.actor);return a?`${a.firstName} ${a.lastName}`:'Identidad no disponible';}
 contact(order:DemoOrder){return this.allowed?this.state.data.actors.find(x=>x.id===order.actor)?.email??'':'';}
 aftercare(order:DemoOrder){return DemoAftercareState.label(this.state.data,order);}
 action(order:DemoOrder){return this.allowed&&this.query().known?orderCommands.find(c=>c.permits(this.state.data,order))??null:null;}
 update(key:string,value:string){void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.query().params,[key]:value||null}});}
 clearFilters(){void this.router.navigate([],{relativeTo:this.route,queryParams:{}});}
 toggle(id:string){if(!this.allowed)return;const next=new Set(this.selected());if(next.has(id))next.delete(id);else if(this.rows().some(o=>o.id===id))next.add(id);this.selected.set(next);}
 toggleVisible(){if(!this.allowed)return;const next=new Set(this.selected()),all=this.rows().length>0&&this.visibleSelected()===this.rows().length;for(const row of this.rows()){if(all)next.delete(row.id);else next.add(row.id);}this.selected.set(next);}
 clearSelection(){this.selected.set(new Set());}
 private capture(){this.trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;this.failure.set('');this.feedback.set('');this.fresh.set(null);}
 export(){if(!this.allowed||!this.selectedCount())return;this.capture();this.intent={id:'',actor:this.authority.actor,epoch:this.authority.epoch,revision:this.state.data.revision,fingerprint:'',tracking:''};this.dialog.set(OrderDialog.Export);}
 open(order:DemoOrder){const command=this.action(order);if(!command||!this.state.writerStatus().writable)return;this.capture();this.command.set(command);this.proposal.set(order.tracking);this.intent={id:order.id,actor:this.authority.actor,epoch:this.authority.epoch,revision:this.state.data.revision,fingerprint:JSON.stringify(order),tracking:order.tracking};this.dialog.set(OrderDialog.Transition);}
 confirm(){if(!this.allowed||!this.intent||this.intent.epoch!==this.authority.epoch||this.intent.actor!==this.authority.actor){this.close();return;}if(this.dialog()===OrderDialog.Export){try{this.browser.downloadCsv(new ExportDemoOrdersStep().execute(this.state.data,this.authority,this.selected()));this.feedback.set('Descarga CSV solicitada. No se modificaron pedidos.');this.close();}catch{this.failure.set('No se pudo descargar. Conservamos tu selección.');this.feedback.set('No se pudo iniciar la descarga CSV.');}return;}const command=this.command();if(!command||!this.query().known)return;const intent={...this.intent,tracking:this.proposal()};this.saving.set(true);const ok=this.state.run(()=>command.execute(this.state.data,this.authority,intent),'Transición guardada en esta Demo.');this.saving.set(false);if(ok){this.feedback.set('Transición guardada en esta Demo.');this.close();}else this.failure.set(this.state.error());}
 close(){const id=this.intent?.id??'';this.modal()?.nativeElement.close();this.dialog.set(null);this.command.set(null);this.failure.set('');this.intent=null;this.restoreAfterRender.set({origin:this.trigger,id});if(this.trigger?.isConnected)this.trigger.focus();}
 reviewCurrent(){if(this.dialog()!==OrderDialog.Transition)return;const intent=this.intent;if(!this.allowed||!intent||!this.state.reloadOrderSnapshot(intent.actor,intent.epoch))return;const order=this.state.data.orders.find(row=>row.id===intent.id);if(!order)return;this.fresh.set(order);this.intent={...intent,revision:this.state.data.revision,fingerprint:JSON.stringify(order)};}
 constructor(){effect(()=>{if(!this.allowed){this.selected.set(new Set());if(this.dialog())this.close();}});afterRenderEffect(()=>{const dialog=this.modal()?.nativeElement;if(dialog&&!dialog.open){dialog.showModal();const field=dialog.querySelector<HTMLElement>('input,button');field?.focus();}const restore=this.restoreAfterRender();if(restore&&!this.dialog()){if(restore.origin?.isConnected)restore.origin.focus();else if(this.allowed)(document.querySelector<HTMLElement>('[data-cta="order-open-'+restore.id+'"]')??this.queueSearch()?.nativeElement)?.focus();this.restoreAfterRender.set(null);}const entry=this.requestedFocus();if(this.allowed&&entry&&entry!==this.focusedTarget){const link=[...document.querySelectorAll<HTMLElement>('[data-cta]')].find(el=>el.getAttribute('data-cta')==='order-open-'+entry);if(link){link.focus();this.focusedTarget=entry;}}});}
}
