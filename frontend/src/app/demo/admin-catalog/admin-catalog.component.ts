import { Component,DestroyRef,ElementRef,HostListener,afterRenderEffect,computed,effect,inject,signal,viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute,Router,RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DemoApplicationState } from '../demo-state';
import { DemoProductVariant,type DemoProduct } from '../demo-model';
import { demoMoney } from '../demo-money';
import { demoProductImage } from '../catalog/demo-product-image';
import { trapDemoDialogFocus } from '../demo-dialog-focus';
import { AdminCatalogCriteria,FilterCatalogRowsStep,PageCatalogRowsStep,ProjectCatalogRowsStep } from './catalog-query';
import { AuthorizeCatalogStep,SaveCatalogProductStep,SetCatalogPublicationStep,catalogFingerprint,type CatalogAuthority } from './catalog-flow';
import { CatalogProductPolicy } from './catalog-policy';
import { CatalogDialog,CatalogIssue,CatalogPublicationFilter,CatalogStockFilter,CatalogValidationError,ProductPublication } from './catalog-types';

@Component({selector:'sc-demo-admin-catalog',imports:[FormsModule,RouterLink],templateUrl:'./admin-catalog.component.html',styleUrls:['../demo.scss','./admin-catalog.component.scss']})
export class DemoAdminCatalogComponent {
  readonly state=inject(DemoApplicationState);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroy=inject(DestroyRef);
  private readonly authorize=new AuthorizeCatalogStep();private readonly project=new ProjectCatalogRowsStep();private readonly filter=new FilterCatalogRowsStep();private readonly pager=new PageCatalogRowsStep();private readonly saveStep=new SaveCatalogProductStep();private readonly publicationStep=new SetCatalogPublicationStep();private readonly policy=new CatalogProductPolicy();
  readonly criteria=toSignal(this.route.queryParamMap.pipe(map(params=>AdminCatalogCriteria.fromWire({q:params.get('q'),publication:params.get('publication'),stock:params.get('stock'),brand:params.get('brand'),category:params.get('category'),page:params.get('page')}))),{initialValue:AdminCatalogCriteria.fromWire({})});
  readonly rows=computed(()=>this.allowed?this.project.execute(this.state.data,sku=>this.state.commerce.price(sku)):[]);
  readonly filtered=computed(()=>this.filter.execute(this.rows(),this.criteria(),this.state.data.settings.lowStockThreshold));readonly page=computed(()=>this.pager.execute(this.filtered(),this.criteria()));
  readonly brands=computed(()=>[...new Set(this.rows().map(row=>row.product.brand))].sort());readonly categories=computed(()=>[...new Set(this.rows().map(row=>row.product.category))].sort());
  readonly queryProblem=computed(()=>!this.criteria().valid||this.page().outOfRange||!!this.criteria().brand&&!this.brands().includes(this.criteria().brand)||!!this.criteria().category&&!this.categories().includes(this.criteria().category));
  readonly publications=CatalogPublicationFilter.all;readonly stocks=CatalogStockFilter.all;readonly Publication=ProductPublication;readonly PublicationFilter=CatalogPublicationFilter;readonly StockFilter=CatalogStockFilter;readonly Dialog=CatalogDialog;readonly Issue=CatalogIssue;readonly Variant=DemoProductVariant;readonly trapFocus=trapDemoDialogFocus;readonly image=demoProductImage;
  readonly dialog=signal(CatalogDialog.None);readonly issue=signal(CatalogIssue.None);readonly error=signal('');readonly feedback=signal('');readonly savedSku=signal('');readonly pendingFocus=signal('');
  readonly target=signal(ProductPublication.Unknown);readonly selectedSku=signal('');editingSku:string|null=null;private expected:string|null=null;private epoch=0;private actor='';private initial='';private restore:HTMLElement|null=null;private contextKey='';private headingKey='';
  draft:DemoProduct=this.blank();baseText='';originalText='';private decision:{promise:Promise<boolean>;resolve:(leave:boolean)=>void}|null=null;
  private readonly heading=viewChild<ElementRef<HTMLElement>>('catalogHeading');private readonly modal=viewChild<ElementRef<HTMLDialogElement>>('catalogModal');
  get authority():CatalogAuthority{return{context:this.state.context(),role:this.state.role(),actor:this.state.actorId(),expectedActor:this.actor,readable:this.state.authorizationAvailable,epoch:this.state.sessionEpoch(),expectedEpoch:this.epoch};}
  get allowed():boolean{return this.authorize.permits({...this.authority,expectedActor:this.state.actorId(),expectedEpoch:this.state.sessionEpoch()},this.state.data);}
  get writable():boolean{return this.allowed&&this.state.writerStatus().writable;}
  get dirty():boolean{return !!this.initial&&JSON.stringify({draft:this.draft,base:this.baseText,original:this.originalText})!==this.initial;}
  get leaving():boolean{return this.decision!==null;}
  readonly selected=computed(()=>this.rows().find(row=>row.product.sku===this.selectedSku()));
  readonly hiddenSaved=computed(()=>!!this.savedSku()&&!this.page().rows.some(row=>row.product.sku===this.savedSku()));
  showSaved():void{const sku=this.savedSku(),index=this.rows().findIndex(row=>row.product.sku===sku);if(!this.allowed||index<0)return;const page=Math.floor(index/this.pager.size);this.pendingFocus.set('catalog-row-'+sku);void this.router.navigate([],{relativeTo:this.route,queryParams:page?{page:String(page+1)}:{}});}
  money(value:number|null):string{return value===null?'Importe no disponible':demoMoney(value);}
  private blank():DemoProduct{return{sku:'',name:'',brand:'',category:'',description:'',price:100,original:100,onHand:0,reserved:0,active:true,tone:'#667b94',variant:DemoProductVariant.Standard.label,supportsCase:false};}
  update(patch:Record<string,string|null>):void{void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.criteria().query,...patch,page:null}});}
  changePage(page:number):void{void this.router.navigate([],{relativeTo:this.route,queryParams:{...this.criteria().query,page:page?String(page+1):null}}).then(()=>{if(!this.destroy.destroyed)this.heading()?.nativeElement.focus();});}
  clearFilters():void{void this.router.navigate([],{relativeTo:this.route,queryParams:{}});}
  private begin(dialog:CatalogDialog):void{this.epoch=this.state.sessionEpoch();this.actor=this.state.actorId();this.restore=document.activeElement instanceof HTMLElement?document.activeElement:null;this.issue.set(CatalogIssue.None);this.error.set('');this.dialog.set(dialog);this.pendingFocus.set(dialog===CatalogDialog.Editor?'catalog-name':'catalog-modal-heading');}
  edit(product?:DemoProduct):void{
    if(!this.writable)return;this.draft=product?{...product}:this.blank();this.editingSku=product?.sku??null;this.selectedSku.set(product?.sku??'');this.expected=product?catalogFingerprint(product):null;this.draft.sku=product?.sku??'DEMO-'+crypto.randomUUID().slice(0,8);this.baseText=product?this.policy.formatPrice(product.price):'';this.originalText=product?this.policy.formatPrice(product.original):'';this.initial=JSON.stringify({draft:this.draft,base:this.baseText,original:this.originalText});this.begin(CatalogDialog.Editor);
  }
  setPublication(product:DemoProduct):void{if(!this.writable)return;this.selectedSku.set(product.sku);this.expected=catalogFingerprint(product);this.target.set(ProductPublication.fromWire(product.active).next());this.initial='';this.begin(CatalogDialog.Publication);}
  preview(product:DemoProduct):void{if(!this.allowed)return;this.selectedSku.set(product.sku);this.initial='';this.begin(CatalogDialog.Preview);}
  private transact(action:()=>void,message:string):boolean{let issue=CatalogIssue.Conflict;const ok=this.state.run(()=>{if(this.destroy.destroyed||!this.writable||this.actor!==this.state.actorId()||this.epoch!==this.state.sessionEpoch())throw new CatalogValidationError(CatalogIssue.Authority);try{action();}catch(error){if(error instanceof CatalogValidationError)issue=error.issue;throw error;}},message);if(!ok){this.issue.set(issue);this.error.set(this.state.error());this.pendingFocus.set(issue.field);}return ok;}
  save():void{
    if(this.destroy.destroyed||this.actor!==this.state.actorId()||this.epoch!==this.state.sessionEpoch()||this.dialog()!==CatalogDialog.Editor||!this.writable)return;let product:DemoProduct;try{product={...this.draft,name:this.draft.name.trim(),brand:this.draft.brand.trim(),category:this.draft.category.trim(),price:this.policy.parsePrice(this.baseText),original:this.policy.parsePrice(this.originalText,CatalogIssue.Original)};}catch(error){this.issue.set(error instanceof CatalogValidationError?error.issue:CatalogIssue.Unknown);this.error.set(this.issue().label);this.pendingFocus.set(this.issue().field);return;}
    if(this.transact(()=>{this.saveStep.execute(this.state.data,this.authority,product,this.editingSku,this.expected);},'Producto guardado en esta Demo. No se cambió el stock.')){this.initial='';this.finish('Producto '+product.sku+' guardado.',product.sku);}
  }
  confirmPublication():void{if(this.destroy.destroyed||this.actor!==this.state.actorId()||this.epoch!==this.state.sessionEpoch()||this.dialog()!==CatalogDialog.Publication||!this.writable)return;if(this.transact(()=>{this.publicationStep.execute(this.state.data,this.authority,this.selectedSku(),this.target(),this.expected??'');},'Publicación actualizada en esta Demo; stock e históricos conservados.'))this.finish('Publicación de '+this.selectedSku()+' actualizada.',this.selectedSku());}
  private finish(message:string,sku:string):void{this.close(false);this.savedSku.set(sku);this.feedback.set(message);this.pendingFocus.set('catalog-feedback');}
  requestClose():void{if(this.dialog()===CatalogDialog.Discard){this.dialog.set(CatalogDialog.Editor);this.pendingFocus.set('catalog-name');this.resolve(false);return;}if(this.dialog()===CatalogDialog.Editor&&this.dirty){this.dialog.set(CatalogDialog.Discard);this.pendingFocus.set('catalog-modal-heading');return;}this.close();}
  private close(restore=true):void{this.modal()?.nativeElement.close();this.dialog.set(CatalogDialog.None);this.pendingFocus.set('');this.initial='';this.error.set('');this.issue.set(CatalogIssue.None);if(restore&&this.restore?.isConnected)this.restore.focus();else if(restore)this.heading()?.nativeElement.focus();}
  confirmDiscard():void{if(this.epoch!==this.state.sessionEpoch()||!this.allowed){this.invalidate();return;}this.close();this.resolve(true);}
  canLeave():boolean|Promise<boolean>{if(!this.allowed||this.actor!==this.state.actorId()||this.epoch!==this.state.sessionEpoch()){this.invalidate();return true;}if(!this.dirty)return true;if(this.decision)return this.decision.promise;let resolve!:(leave:boolean)=>void;const promise=new Promise<boolean>(done=>resolve=done);this.decision={promise,resolve};this.dialog.set(CatalogDialog.Discard);this.pendingFocus.set('catalog-modal-heading');return promise;}
  private resolve(leave:boolean):void{const decision=this.decision;this.decision=null;decision?.resolve(leave);}
  private invalidate():void{this.close(false);this.draft=this.blank();this.baseText='';this.originalText='';this.expected=null;this.restore=null;this.actor='';this.selectedSku.set('');this.target.set(ProductPublication.Unknown);this.savedSku.set('');this.feedback.set('');this.resolve(true);}
  @HostListener('document:keydown.escape',['$event']) escape(event:Event):void{if(this.dialog()!==CatalogDialog.None){event.preventDefault();this.requestClose();}}
  @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent):void{if(this.allowed&&this.dirty){event.preventDefault();event.returnValue='';}}
  constructor(){
    effect(()=>{const key=this.state.sessionEpoch()+':'+this.state.actorId()+':'+this.allowed;if(this.contextKey&&this.contextKey!==key)this.invalidate();this.contextKey=key;});
    afterRenderEffect(()=>{const key=this.state.sessionEpoch()+':'+this.allowed,heading=this.heading()?.nativeElement;if(heading&&key!==this.headingKey){this.headingKey=key;heading.focus();}const modal=this.modal()?.nativeElement;if(modal&&!modal.open)modal.showModal();const focus=this.pendingFocus();if(focus){const element=document.getElementById(focus);if(element){element.focus();this.pendingFocus.set('');}}});
    this.destroy.onDestroy(()=>{this.modal()?.nativeElement.close();this.resolve(true);});
  }
}
