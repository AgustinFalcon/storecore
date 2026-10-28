import { Component,afterRenderEffect,effect,input,signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogDetailsDraft } from './catalog-details-draft';
import { CATALOG_ASSETS,CatalogMediaRegistry } from './catalog-media';
import { CatalogDetailIssue,CatalogPricingBasis,ItemCondition,CatalogCompareAt } from './catalog-details-types';
import { ProductCondition,OutletScope,VariantSaleState } from '../catalog/catalog-types';
import { DemoProductVariant } from '../catalog/product-variant';
import { CatalogProductPolicy } from '../admin-catalog/catalog-policy';
import { demoMoney } from '../demo-money';
@Component({selector:'sc-catalog-details-editor',imports:[FormsModule],templateUrl:'./catalog-details-editor.component.html',styleUrls:['../demo.scss','./catalog-details-editor.component.scss']})
export class CatalogDetailsEditorComponent {
  readonly buffer=input.required<CatalogDetailsDraft>();readonly existing=input(false);readonly issue=input<CatalogDetailIssue|null>(null);readonly base=input('');readonly original=input('');
  readonly Kind=ProductCondition;readonly Condition=ItemCondition;readonly Scope=OutletScope;readonly State=VariantSaleState;readonly Variant=DemoProductVariant;readonly Pricing=CatalogPricingBasis;readonly Issue=CatalogDetailIssue;readonly assets=CATALOG_ASSETS;
  readonly announcement=signal('');private readonly pendingFocus=signal('');assetChoice=CATALOG_ASSETS[0].id;readonly money=demoMoney;
  get value(){return this.buffer().value;}
  asset(id:string){return CatalogMediaRegistry.find(id);}
  hasAsset(id:string):boolean{return this.value.media.some(item=>item.assetId===id);}
  get canAddMedia():boolean{return this.value.media.length<8&&!this.hasAsset(this.assetChoice);}
  changeKind(raw:unknown):void{if(this.existing())return;this.value.kind=ProductCondition.fromWire(raw);if(this.value.kind===ProductCondition.Outlet){this.value.outlet={scope:OutletScope.Unit,reference:'',notes:'',defects:''};this.value.variants=this.value.variants.filter(value=>value.variant===DemoProductVariant.Standard);this.value.media=CATALOG_ASSETS.filter(asset=>asset.specimen).map(asset=>({id:crypto.randomUUID(),assetId:asset.id,alt:asset.label}));}else this.value.outlet=null;}
  changeCondition(raw:unknown):void{this.value.condition=ItemCondition.fromWire(raw);}
  changeScope(raw:unknown):void{if(this.value.outlet&&!this.existing())this.value.outlet.scope=OutletScope.fromWire(raw);}
  state(raw:unknown,index:number):void{this.value.variants[index].state=VariantSaleState.fromWire(raw);}
  pricing(raw:unknown,index:number):void{this.value.variants[index].pricing=CatalogPricingBasis.fromWire(raw);}
  addCase():void{if(this.value.kind===ProductCondition.Outlet||this.value.variants.some(value=>value.variant===DemoProductVariant.Case))return;this.value.variants.push({variant:DemoProductVariant.Case,state:VariantSaleState.Active,price:250100,original:250100,pricing:CatalogPricingBasis.LegacySurcharge,comparison:CatalogCompareAt.Known});this.buffer().caseBase='2501.00';this.buffer().caseOriginal='2501.00';this.announcement.set('Presentación con estuche agregada. Comparte el stock del SKU.');}
  addMedia():void{if(!this.canAddMedia){this.announcement.set('La imagen ya está en la galería o se alcanzó el máximo de ocho imágenes.');return;}const asset=this.asset(this.assetChoice);if(!asset)return;const item={id:crypto.randomUUID(),assetId:asset.id,alt:asset.label};this.value.media.push(item);this.assetChoice=this.assets.find(asset=>!this.hasAsset(asset.id))?.id??this.assetChoice;this.pendingFocus.set('catalog-media-'+item.id);this.announcement.set('Imagen agregada en posición '+this.value.media.length+'.');}
  remove(id:string):void{if(this.value.media.length<=1)return;const index=this.value.media.findIndex(item=>item.id===id);this.value.media=this.value.media.filter(item=>item.id!==id);this.pendingFocus.set('catalog-media-'+this.value.media[Math.min(index,this.value.media.length-1)].id);this.announcement.set('Imagen quitada. La primera imagen es la portada.');}
  move(id:string,direction:number):void{const index=this.value.media.findIndex(item=>item.id===id),target=index+direction;if(index<0||target<0||target>=this.value.media.length)return;const [item]=this.value.media.splice(index,1);this.value.media.splice(target,0,item);this.pendingFocus.set('catalog-media-'+id);this.announcement.set(item.alt+', imagen '+(target+1)+' de '+this.value.media.length+(target===0?'; portada.':'.'));}
  legacyPrice(original=false):number{try{const amount=new CatalogProductPolicy().parsePrice(original?this.original():this.base())+DemoProductVariant.Case.extraUnit;return Number.isSafeInteger(amount)?amount:Number.NaN;}catch{return Number.NaN;}}
  legacyComparator():string{const amount=this.legacyPrice(true);return Number.isSafeInteger(amount)?this.money(amount):CatalogCompareAt.Unavailable.label;}
  constructor(){effect(()=>{this.buffer();this.assetChoice=this.assets.find(asset=>!this.hasAsset(asset.id))?.id??this.assets[0].id;});afterRenderEffect(()=>{const id=this.pendingFocus();if(id){const element=document.getElementById(id);if(element){element.focus();this.pendingFocus.set('');}}});}
}
