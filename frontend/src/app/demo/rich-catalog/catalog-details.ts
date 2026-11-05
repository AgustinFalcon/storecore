import type { DemoProduct,DemoSnapshot } from '../demo-model';
import { DemoProductVariant } from '../catalog/product-variant';
import { OutletScope,ProductCondition,VariantSaleState } from '../catalog/catalog-types';
import { ItemCondition,CatalogDetailError,CatalogDetailIssue,CatalogPricingBasis,CatalogCompareAt } from './catalog-details-types';
import { CatalogMediaRegistry } from './catalog-media';
export interface CatalogMedia {id:string;assetId:string;alt:string;}
export interface CatalogPresentation {variant:DemoProductVariant;state:VariantSaleState;price:number;original:number|null;pricing:CatalogPricingBasis;comparison:CatalogCompareAt;}
export interface CatalogOutlet {scope:OutletScope;reference:string;notes:string;defects:string;}
export interface CatalogDetails {sku:string;media:CatalogMedia[];variants:CatalogPresentation[];kind:ProductCondition;condition:ItemCondition;warrantyTerms:string;notSellable:number;outlet:CatalogOutlet|null;}
const text=(raw:unknown,max:number)=>typeof raw==='string'&&!!raw.trim()&&raw.length<=max;
const wire=(raw:unknown):unknown=>raw!==null&&typeof raw==='object'&&'wire'in raw?raw.wire:raw;
export class CatalogDetailsPolicy {
  static known(detail:CatalogDetails):boolean{return detail.kind!==ProductCondition.Unknown&&detail.condition!==ItemCondition.Unknown&&detail.variants.every(variant=>variant.state!==VariantSaleState.Unknown&&variant.pricing!==CatalogPricingBasis.Unknown&&variant.comparison!==CatalogCompareAt.Unknown)&&(!detail.outlet||detail.outlet.scope!==OutletScope.Unknown);}
  static validate(detail:CatalogDetails,product:DemoProduct,allowUnknown=false):void{
    const fail=(issue:CatalogDetailIssue):never=>{throw new CatalogDetailError(issue);};
    if(detail.sku!==product.sku||!Array.isArray(detail.media)||detail.media.length<1||detail.media.length>8||new Set(detail.media.map(item=>item.id)).size!==detail.media.length||new Set(detail.media.map(item=>item.assetId)).size!==detail.media.length||detail.media.some(item=>!text(item.id,80)||!CatalogMediaRegistry.find(item.assetId)||!text(item.alt,240)))fail(CatalogDetailIssue.Media);
    if(!Array.isArray(detail.variants)||detail.variants.length<1||detail.variants.length>2||new Set(detail.variants.map(value=>value.variant)).size!==detail.variants.length||detail.variants.some(value=>value.variant===DemoProductVariant.Unknown||!Number.isSafeInteger(value.price)||value.price<1||value.original!==null&&(!Number.isSafeInteger(value.original)||value.original<value.price)||value.comparison===CatalogCompareAt.Known&&value.original===null||value.comparison===CatalogCompareAt.Unavailable&&(value.original!==null||value.variant!==DemoProductVariant.Case||value.pricing!==CatalogPricingBasis.LegacySurcharge)))fail(CatalogDetailIssue.Variant);
    const standard=detail.variants.find(value=>value.variant===DemoProductVariant.Standard),caseVariant=detail.variants.find(value=>value.variant===DemoProductVariant.Case);
    if(!standard||standard.comparison!==CatalogCompareAt.Known&&!(allowUnknown&&standard.comparison===CatalogCompareAt.Unknown)||standard.price!==product.price||standard.original!==product.original||!!caseVariant!==(product.supportsCase===true))fail(CatalogDetailIssue.Variant);
    if(detail.variants.some(value=>value.pricing===CatalogPricingBasis.LegacySurcharge&&(value.variant!==DemoProductVariant.Case||value.price!==product.price+value.variant.extraUnit||value.comparison===CatalogCompareAt.Known&&value.original!==product.original+value.variant.extraUnit||value.comparison===CatalogCompareAt.Unavailable&&Number.isSafeInteger(product.original+value.variant.extraUnit))))fail(CatalogDetailIssue.Variant);
    if(!allowUnknown&&!this.known(detail)||!detail.variants.some(value=>value.state===VariantSaleState.Active||allowUnknown&&value.state===VariantSaleState.Unknown))fail(CatalogDetailIssue.State);
    if(!Number.isSafeInteger(detail.notSellable)||detail.notSellable<0||!Number.isSafeInteger(product.reserved+detail.notSellable)||product.reserved+detail.notSellable>product.onHand)fail(CatalogDetailIssue.Stock);
    if(typeof detail.warrantyTerms!=='string'||detail.warrantyTerms.length>1200)fail(CatalogDetailIssue.Outlet);
    if(detail.kind===ProductCondition.Outlet){const outlet=detail.outlet;if(!outlet||(!allowUnknown&&outlet.scope===OutletScope.Unknown)||!text(outlet.reference,80)||!text(outlet.notes,1200)||!text(outlet.defects,1200)||!text(detail.warrantyTerms,1200)||detail.condition===ItemCondition.Unspecified||detail.variants.length!==1||detail.media.some(item=>!CatalogMediaRegistry.find(item.assetId)?.specimen)||outlet.scope!==OutletScope.Unknown&&product.onHand>outlet.scope.maximumUnits)fail(CatalogDetailIssue.Outlet);}
    else if(detail.outlet!==null||detail.condition===ItemCondition.Used||detail.condition===ItemCondition.Reconditioned)fail(CatalogDetailIssue.Outlet);
  }
  static clone(detail:CatalogDetails):CatalogDetails{return{...detail,media:detail.media.map(item=>({...item})),variants:detail.variants.map(item=>({...item})),outlet:detail.outlet?{...detail.outlet}:null};}
}
/** One additive migration step. Never allocates stock to presentations or changes historical entities. */
export class MigrateCatalogV4ToV5Step {
  execute(products:readonly DemoProduct[]):CatalogDetails[]{return products.map((product,index)=>({sku:product.sku,media:[{id:product.sku+'-cover',assetId:CatalogMediaRegistry.find(product.sku)?.id??'DEMO-'+String(index%12+1).padStart(3,'0'),alt:'Ilustración Demo de '+product.name}],variants:(product.supportsCase?[DemoProductVariant.Standard,DemoProductVariant.Case]:[DemoProductVariant.Standard]).map(variant=>({variant,state:VariantSaleState.Active,price:product.price+variant.extraUnit,original:Number.isSafeInteger(product.original+variant.extraUnit)?product.original+variant.extraUnit:null,pricing:variant===DemoProductVariant.Case?CatalogPricingBasis.LegacySurcharge:CatalogPricingBasis.OwnBase,comparison:Number.isSafeInteger(product.original+variant.extraUnit)?CatalogCompareAt.Known:CatalogCompareAt.Unavailable})),kind:ProductCondition.Standard,condition:ItemCondition.Unspecified,warrantyTerms:'',notSellable:0,outlet:null}));}
}
export class CatalogDetailsCodec {
  static fromWire(raw:unknown,products:readonly DemoProduct[]):CatalogDetails[]{
    if(!Array.isArray(raw)||raw.length!==products.length)throw new CatalogDetailError(CatalogDetailIssue.Variant);
    const details=raw.map((value:CatalogDetails)=>{
      if(!value||!['sku','media','variants','kind','condition','warrantyTerms','notSellable','outlet'].every(key=>Object.prototype.hasOwnProperty.call(value,key))||!Array.isArray(value.variants)||!Array.isArray(value.media)||value.variants.some(item=>!item||!['variant','state','price','original','pricing','comparison'].every(key=>Object.prototype.hasOwnProperty.call(item,key))))throw new CatalogDetailError(CatalogDetailIssue.Variant);
      if(value.outlet!==null&&(typeof value.outlet!=='object'||Array.isArray(value.outlet)||!['scope','reference','notes','defects'].every(key=>Object.prototype.hasOwnProperty.call(value.outlet,key))))throw new CatalogDetailError(CatalogDetailIssue.Outlet);
      const detail:CatalogDetails={sku:value.sku,media:value.media.map(item=>({...item})),variants:value.variants.map(item=>({...item,variant:DemoProductVariant.fromWire(wire(item.variant)),state:VariantSaleState.fromWire(wire(item.state)),pricing:CatalogPricingBasis.fromWire(wire(item.pricing)),comparison:CatalogCompareAt.fromWire(wire(item.comparison))})),kind:ProductCondition.fromWire(wire(value.kind)),condition:ItemCondition.fromWire(wire(value.condition)),warrantyTerms:value.warrantyTerms,notSellable:value.notSellable,outlet:value.outlet===null?null:{...value.outlet,scope:OutletScope.fromWire(wire(value.outlet.scope))}};
      const product=products.find(product=>product.sku===detail.sku);if(!product)throw new CatalogDetailError(CatalogDetailIssue.Variant);CatalogDetailsPolicy.validate(detail,product,true);return detail;
    });
    const references=details.filter(detail=>detail.outlet).map(detail=>detail.outlet!.reference);
    if(new Set(details.map(detail=>detail.sku)).size!==products.length||new Set(references).size!==references.length)throw new CatalogDetailError(CatalogDetailIssue.Variant);return details;
  }
}
export class CatalogDetailsRead {
  static detail(snapshot:Pick<DemoSnapshot,'catalogDetails'>,sku:string):CatalogDetails|undefined{return snapshot.catalogDetails?.find(detail=>detail.sku===sku);}
  static presentation(snapshot:Pick<DemoSnapshot,'catalogDetails'>,sku:string,variant:DemoProductVariant):CatalogPresentation|undefined{return this.detail(snapshot,sku)?.variants.find(value=>value.variant===variant);}
  static balance(snapshot:Pick<DemoSnapshot,'catalogDetails'>,product:DemoProduct):number|null{const detail=this.detail(snapshot,product.sku);if(!Number.isSafeInteger(product.onHand)||!Number.isSafeInteger(product.reserved)||product.reserved<0||product.reserved>product.onHand||detail&&!CatalogDetailsPolicy.known(detail))return null;const notSellable=detail?.notSellable??0;if(!Number.isSafeInteger(notSellable)||notSellable<0||!Number.isSafeInteger(product.reserved+notSellable)||product.reserved+notSellable>product.onHand)return null;return product.active?product.onHand-product.reserved-notSellable:0;}
  static available(snapshot:Pick<DemoSnapshot,'catalogDetails'>,product:DemoProduct,variant?:DemoProductVariant):number{const balance=this.balance(snapshot,product);if(balance===null||variant&&this.detail(snapshot,product.sku)&&this.presentation(snapshot,product.sku,variant)?.state!==VariantSaleState.Active)return 0;return balance;}
}
