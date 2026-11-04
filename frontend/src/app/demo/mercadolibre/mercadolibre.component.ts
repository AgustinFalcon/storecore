import {Component,ElementRef,afterRenderEffect,effect,inject,signal,untracked,viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {DemoModuleId} from '../demo-model';
import {MLLegacyLink,MLLegacyStock} from './ml-types';
import {DemoApplicationState} from '../demo-state';
import {DemoSnapshotConflict} from '../catalog/catalog-types';
import {InventoryAccess,InventoryPool} from '../inventory/inventory-flow';
import {MLPhase} from './ml-types';
import {QuoteCatalogPresentationStep} from '../rich-catalog/catalog-price';
import {demoMoney} from '../demo-money';
import {trapDemoDialogFocus} from '../demo-dialog-focus';
import {MLAction,MLTab,MLIntentType,MLPublication,MLAccountState,MLMappingState,MLEventType,MLResult,type MLIntent} from './ml-types';
import {MLIntentPolicy} from './ml-intent-policy';
import {mlLedger,mlCurrent,mlStatus,mlSteps,mlReviewContext,type MLCommand} from './ml-flow';
import {MLQuery} from './ml-query';
@Component({selector:'sc-demo-mercadolibre',imports:[FormsModule,RouterLink],templateUrl:'./mercadolibre.component.html',styleUrls:['../demo.scss','./mercadolibre.component.scss']})
export class DemoMercadoLibreComponent {
 readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);
 readonly query=toSignal(this.route.queryParamMap.pipe(map(p=>MLQuery.fromWire(Object.fromEntries(p.keys.map(k=>[k,p.get(k)]))))),{initialValue:MLQuery.fromWire({})});
 readonly Tab=MLTab;readonly tabs=MLTab.all;readonly Type=MLIntentType;readonly types=MLIntentType.all;readonly Event=MLEventType;readonly events=MLEventType.all;readonly Action=MLAction;readonly Account=MLAccountState;readonly Mapping=MLMappingState;readonly Phase=MLPhase;readonly publications=MLPublication.all;
 readonly phase=signal(MLPhase.Editing);readonly draft=signal<MLCommand|null>(null);readonly feedback=signal('');readonly ready=signal(false);readonly focusStage=signal(false);readonly trap=trapDemoDialogFocus;
 private trigger:HTMLElement|null=null;private readonly restore=signal(false);private focused='';private readonly root=viewChild<ElementRef<HTMLElement>>('root');private readonly heading=viewChild<ElementRef<HTMLElement>>('heading');private readonly modal=viewChild<ElementRef<HTMLDialogElement>>('modal');private readonly stage=viewChild<ElementRef<HTMLElement>>('stage');
 readonly money=demoMoney;readonly current=mlCurrent;readonly status=mlStatus;
 get authority(){return {context:this.state.context(),role:this.state.role(),actor:this.state.actorId(),epoch:this.state.sessionEpoch(),readable:this.state.authorizationAvailable};}
 get allowed(){return InventoryAccess.permits(this.authority);}
 get enabled(){return this.allowed&&this.state.data.modules.some(m=>m.id===DemoModuleId.MercadoLibre&&m.enabled===true);}
 get writable(){return this.enabled&&this.state.writerStatus().writable;}
 get ledger(){return this.allowed?mlLedger(this.state.data):null;}
 get allIntents(){return this.ledger?.intents??[];}
 get filteredIntents(){const q=this.query();return this.allIntents.filter(i=>(!q.q||(i.sku+' '+(this.state.data.products.find(p=>p.sku===i.sku)?.name??'')).toLowerCase().includes(q.q.toLowerCase()))&&(!q.type||i.type===q.type)&&(!q.status||mlStatus(i)===q.status));}
 get products(){const q=this.query();return this.allowed&&q.known?this.state.data.products.filter(p=>(!q.q||(p.sku+' '+p.name).toLowerCase().includes(q.q.toLowerCase()))&&(!q.type&&!q.status||this.allIntents.some(i=>i.sku===p.sku&&(!q.type||i.type===q.type)&&(!q.status||mlStatus(i)===q.status)))):[];}
 get count(){return this.query().tab===MLTab.Sync?this.filteredIntents.length:this.products.length;}
 get pageSize(){return this.allowed?this.state.data.settings.mlRows:6;}
 get pageCount(){return Math.max(1,Math.ceil(this.count/this.pageSize));}get page(){return Math.min(this.query().page,this.pageCount);}get rows(){return this.products.slice((this.page-1)*this.pageSize,this.page*this.pageSize);}get intentRows(){return this.filteredIntents.slice((this.page-1)*this.pageSize,this.page*this.pageSize);}
 mapping(sku:string){return this.ledger?.mappings.find(m=>m.sku===sku);}
 legacy(sku:string){return this.allowed?this.state.data.listings.find(l=>l.sku===sku):undefined;}
 legacyLink(sku:string){const row=this.legacy(sku);return row?MLLegacyLink.fromWire(row.linked):MLLegacyLink.Missing;}
 legacyStock(sku:string){const row=this.legacy(sku);return row&&this.legacyLink(sku)===MLLegacyLink.Unknown?MLLegacyStock.Unknown:MLLegacyStock.fromWire(row?.observed);}
 balance(sku:string){const p=this.allowed?this.state.data.products.find(p=>p.sku===sku):null;return p?InventoryPool.balances(this.state.data,p)?.sellable??null:null;}
 effective(sku:string){const p=this.allowed?this.state.data.products.find(p=>p.sku===sku):null;return p?new QuoteCatalogPresentationStep().execute(this.state.data,p,this.state.data.offerReference):null;}
 value(i:MLIntent,observed=false){const v=observed?i.observed:i.value;return i.type===MLIntentType.Unknown?'Valor no evaluable':v===undefined?'Sin observado con evidencia':v instanceof MLPublication?v.label:i.type===MLIntentType.Price?this.money(Number(v)):String(v);}
 filter(key:string,value:string|number){void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.query().params,page:1,[key]:value||null}});}
 clear(){void this.router.navigate([],{relativeTo:this.route,queryParams:{tab:(this.query().tab===MLTab.Unknown?MLTab.Listings:this.query().tab).wire}});}
 tabKey(e:KeyboardEvent,index:number){let target=index;if(e.key==='ArrowRight')target=(index+1)%this.tabs.length;else if(e.key==='ArrowLeft')target=(index+this.tabs.length-1)%this.tabs.length;else if(e.key==='Home')target=0;else if(e.key==='End')target=this.tabs.length-1;else return;e.preventDefault();this.filter('tab',this.tabs[target].wire);this.root()?.nativeElement.querySelectorAll<HTMLElement>('[role=tab]')[target]?.focus();}
 outcomeReason(i:MLIntent){return MLIntentPolicy.outcomeReason(this.ledger!,i);}
 operable(i:MLIntent){return !!this.ledger&&MLIntentPolicy.unknownReason(this.ledger,i).permitted;}
 private contextualize(d:MLCommand):MLCommand{const context=mlReviewContext(this.state.data,d.action,d.sku),i=this.allIntents.find(i=>i.id===d.intent),m=this.mapping(d.sku);let target={account:d.account,listing:d.listing,variation:d.variation};if(i){const tuple=JSON.parse(i.destination) as string[];target={account:tuple[0],listing:tuple[1],variation:tuple[2]};}else if(d.action===MLAction.Intent)target={account:m?.account??context.reviewedAccount,listing:m?.listing??'',variation:m?.variation??''};else if(d.action===MLAction.Disconnect||d.action===MLAction.Mapping)target={...target,account:context.reviewedAccount};return {...d,...context,...target,...(i?{type:i.type,value:i.value}:{})};}
 open(action:MLAction,sku='',intent?:MLIntent){if(!this.writable)return;this.trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;this.draft.set(this.contextualize({...mlReviewContext(this.state.data,action,sku),id:crypto.randomUUID(),action,actor:this.authority.actor,epoch:this.authority.epoch,revision:this.state.data.revision,sku,type:intent?.type??MLIntentType.Stock,value:intent?.value??0,account:this.ledger?.account.identity??'',listing:this.mapping(sku)?.listing??'',variation:this.mapping(sku)?.variation??'',intent:intent?.id??'',attempt:intent?mlCurrent(intent).id:'',outcome:MLEventType.Confirmed}));this.phase.set(MLPhase.Editing);this.feedback.set('');}
 update(p:Partial<MLCommand>){const d=this.draft();if(d&&this.phase()===MLPhase.Editing)this.draft.set({...d,...p});}
 setType(raw:unknown){const type=MLIntentType.fromWire(raw);this.update({type,value:type===MLIntentType.Publication?MLPublication.Publish:0});}
 setPublication(raw:unknown){this.update({value:MLPublication.fromWire(raw)});}setOutcome(raw:unknown){this.update({outcome:MLEventType.fromWire(raw)});}
 get proposed(){const d=this.draft();if(!d||!this.allowed)return null;return d.type===MLIntentType.Stock&&d.action===MLAction.Intent?this.balance(d.sku):d.value;}
 get proposedLabel(){const v=this.proposed;return v===null?'No disponible':v instanceof MLPublication?v.label:this.draft()?.type===MLIntentType.Price?this.money(v):String(v);}
 get reviewFacts(){const d=this.draft();if(!d)return[];if(d.action===MLAction.Connect)return ['Cuenta actual: '+(d.reviewedAccount||'No informada'),'Cuenta propuesta: '+d.account,'Generación revisada: '+d.accountGeneration+' → '+(d.accountGeneration+1),'Intentos vigentes que quedarán superados: '+this.allIntents.filter(i=>mlStatus(i)!==MLEventType.Superseded).length,d.action.impact];if(d.action===MLAction.Disconnect)return ['Cuenta simulada: '+(d.account||'No informada'),'Generación revisada: '+d.accountGeneration,d.action.impact];if(d.action===MLAction.Mapping)return ['Mapping actual revisado: '+(d.reviewedDestination||'Sin mapping')+' · generación '+d.mappingGeneration,'Cuenta revisada: '+d.reviewedAccount+' · generación '+d.accountGeneration,'SKU: '+d.sku,'Cuenta simulada: '+d.account,'Publicación: '+d.listing,'Variación: '+(d.variation||'Sin variación'),d.action.impact];return ['Cuenta revisada: '+d.reviewedAccount+' · generación '+d.accountGeneration,'Mapping revisado: '+d.reviewedDestination+' · generación '+d.mappingGeneration,'SKU: '+d.sku,'Tipo: '+d.type.label,'Destino simulado: '+JSON.stringify([d.account,d.listing,d.variation]),'Valor solicitado: '+this.proposedLabel,d.action.impact];}
 get terminal(){return [MLPhase.Applied,MLPhase.AlreadyApplied].includes(this.phase());}
 get recoverable(){return [MLPhase.Conflict,MLPhase.Failed,MLPhase.Blocked].includes(this.phase());}
 private identity(){const d=this.draft();if(!d||!this.allowed||d.actor!==this.authority.actor||d.epoch!==this.authority.epoch){this.close();return false;}return true;}
 review(){if(!this.identity())return;const d=this.draft()!;if(!this.query().known||!this.writable){this.phase.set(MLPhase.Blocked);this.focusStage.set(true);return;}const intent=this.allIntents.find(i=>i.id===d.intent);if(intent&&(!this.operable(intent)||d.action===MLAction.Outcome&&!this.outcomeReason(intent).permitted)){this.phase.set(MLPhase.Blocked);this.feedback.set(this.outcomeReason(intent).label);this.focusStage.set(true);return;}if(d.action===MLAction.Connect&&!d.account.trim()||d.action===MLAction.Mapping&&!d.listing.trim()){this.feedback.set('Completá los identificadores de simulación antes de revisar.');this.focusStage.set(true);return;}if(d.action===MLAction.Intent&&!d.type.valid(this.proposed)){this.feedback.set('Indicá un importe en centavos seguro y positivo, o una publicación reconocida.');return;}this.phase.set(MLPhase.Reviewing);this.focusStage.set(true);}
 edit(){if(!this.identity()||this.terminal)return;this.phase.set(MLPhase.Editing);this.focusStage.set(true);}
 confirm(){if(!this.identity()||this.phase()!==MLPhase.Reviewing)return;const d=this.draft()!,step=mlSteps.find(s=>s.action===d.action);if(!step)return;let result=MLResult.Failed;const ok=this.state.run(()=>{result=step.execute(this.state.data,this.authority,d,new Date().toISOString());if(![MLResult.Applied,MLResult.AlreadyApplied].includes(result))throw result;},'Simulación guardada localmente.',error=>{if([MLResult.Failed,MLResult.Applied,MLResult.AlreadyApplied].includes(result))result=!this.state.writerStatus().writable?MLResult.Blocked:error instanceof DemoSnapshotConflict?MLResult.Conflict:MLResult.Failed;});this.phase.set(ok?result===MLResult.AlreadyApplied?MLPhase.AlreadyApplied:MLPhase.Applied:result===MLResult.Conflict?MLPhase.Conflict:result===MLResult.Failed?MLPhase.Failed:MLPhase.Blocked);this.feedback.set(result.label);this.state.error.set('');this.focusStage.set(true);}
 refresh(){if(!this.identity())return;const d=this.draft()!;if(this.state.reloadOrderSnapshot(d.actor,d.epoch)){this.draft.set(this.contextualize({...d,revision:this.state.data.revision}));this.phase.set(MLPhase.Editing);this.feedback.set('Datos actualizados. Revisá y reconfirmá la propuesta.');}else this.phase.set(MLPhase.Failed);this.focusStage.set(true);}
 reload(){if(this.allowed)this.state.reloadOrderSnapshot(this.authority.actor,this.authority.epoch);}
 close(){this.modal()?.nativeElement.close();this.draft.set(null);this.restore.set(true);}
 constructor(){effect(()=>{this.state.actorId();this.state.sessionEpoch();this.state.context();this.state.role();untracked(()=>{this.close();this.feedback.set('');});this.ready.set(true);});afterRenderEffect(()=>{const dialog=this.modal()?.nativeElement;if(dialog&&!dialog.open){dialog.showModal();dialog.querySelector<HTMLElement>('input,select,button')?.focus();}if(this.focusStage()){this.stage()?.nativeElement.focus();this.focusStage.set(false);}if(this.restore()&&!this.draft()){if(this.trigger?.isConnected)this.trigger.focus();else this.heading()?.nativeElement.focus();this.restore.set(false);}const focus=this.query().focus;if(this.ready()&&this.allowed&&focus&&this.focused!==focus){const target=Array.from(this.root()?.nativeElement.querySelectorAll<HTMLElement>('[data-sku]')??[]).find(e=>e.dataset['sku']===focus);(target?.querySelector<HTMLElement>('button')??this.heading()?.nativeElement)?.focus();this.focused=focus;}});}
}
