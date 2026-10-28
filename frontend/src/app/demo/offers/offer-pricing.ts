import type {DemoProduct,DemoSnapshot} from '../demo-model';
import {DemoProductVariant} from '../catalog/product-variant';
import {CatalogDetailsPolicy,CatalogDetailsRead} from '../rich-catalog/catalog-details';
import {CatalogPricingBasis} from '../rich-catalog/catalog-details-types';
import {VariantSaleState} from '../catalog/catalog-types';
import {OfferInstant} from './offer-clock';
import {LegacyOfferSku,type DemoOffer} from './offer-record';
import {OfferActivation,OfferSource,OfferLifecycle,OfferEligibility,OfferIssue,OfferReplacement} from './offer-types';

export class OfferPriceSource {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Base=new OfferPriceSource('base','Precio base de la presentación');static readonly Policy=new OfferPriceSource('policy','Oferta evaluada ganadora');static readonly Legacy=new OfferPriceSource('legacy','Compatibilidad heredada; elegibilidad pendiente');static readonly Unknown=new OfferPriceSource('','Precio no disponible');static readonly all=[this.Base,this.Policy,this.Legacy];static fromWire(raw:unknown){return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class DiscountOfferMoneyStep {
 execute(base:number,bps:number,legacy=false):number|null{if(!Number.isSafeInteger(base)||base<1||!Number.isSafeInteger(bps)||bps<0||bps>10000)return null;let value=(BigInt(base)*BigInt(10000-bps)+5000n)/10000n;if(legacy&&value<1n)value=1n;return value<1n||value>BigInt(Number.MAX_SAFE_INTEGER)?null:Number(value);}
}
export class OfferLifecycleStep {
 execute(row:DemoOffer,reference:OfferInstant):OfferLifecycle{if(!reference.known||row.activation===OfferActivation.Unknown||row.source===OfferSource.Unknown||row.variant===DemoProductVariant.Unknown||row.source===OfferSource.LegacyPreserved&&LegacyOfferSku.fromWire(row.sku)===LegacyOfferSku.Unknown)return OfferLifecycle.Unknown;if(row.activation===OfferActivation.Paused)return OfferLifecycle.Paused;
  if(row.source===OfferSource.LegacyPreserved&&row.legacy&&row.legacy.from<=reference.civilDay&&reference.civilDay<=row.legacy.until)return OfferLifecycle.Active;
  const start=OfferInstant.fromWire(row.startsAt),end=OfferInstant.fromWire(row.endsAt);if(start.time===null||end.time===null||start.time>=end.time)return OfferLifecycle.Invalid;if(row.activation===OfferActivation.Draft)return OfferLifecycle.Draft;if(reference.time!<start.time)return OfferLifecycle.Scheduled;if(reference.time!>=end.time)return OfferLifecycle.Expired;return OfferLifecycle.Active;
 }
}
export interface OfferEvaluation {offer:DemoOffer;variant:DemoProductVariant;lifecycle:OfferLifecycle;eligibility:OfferEligibility;issue:OfferIssue;projected:number|null;}
export class ValidateOfferIntervalScopeStep {
 execute(row:DemoOffer,snapshot:Pick<DemoSnapshot,'products'|'catalogDetails'|'offers'>,variant:DemoProductVariant,reference:OfferInstant):OfferIssue{if(!reference.known||row.source===OfferSource.Unknown||row.activation===OfferActivation.Unknown||row.variant===DemoProductVariant.Unknown||variant===DemoProductVariant.Unknown||row.source===OfferSource.LegacyPreserved&&LegacyOfferSku.fromWire(row.sku)===LegacyOfferSku.Unknown)return OfferIssue.Unknown;const product=snapshot.products.find(value=>value.sku===row.sku),detail=product&&CatalogDetailsRead.detail(snapshot,product.sku);if(row.revisionOf!==null){const original=snapshot.offers.find(value=>value.id===row.revisionOf);if(!original||original.revision!==row.replacesRevision||original.variant===DemoProductVariant.Unknown||original.activation===OfferActivation.Unknown||original.source===OfferSource.Unknown)return OfferIssue.Conflict;}if(!product||row.variant!==null&&row.variant!==variant)return OfferIssue.Scope;if(!detail||!CatalogDetailsPolicy.known(detail))return OfferIssue.Unknown;if(!product.active)return OfferIssue.Archived;if(!detail.variants.some(value=>value.variant===variant&&value.state===VariantSaleState.Active))return OfferIssue.Scope;if(row.source===OfferSource.LegacyPreserved)return OfferIssue.Legacy;const start=OfferInstant.fromWire(row.startsAt),end=OfferInstant.fromWire(row.endsAt);return start.time===null||end.time===null||start.time>=end.time?OfferIssue.Interval:OfferIssue.None;}
}
export class EvaluateOfferMarginFloorStep {
 private readonly validate=new ValidateOfferIntervalScopeStep();private readonly lifecycle=new OfferLifecycleStep();private readonly discount=new DiscountOfferMoneyStep();
 execute(row:DemoOffer,snapshot:Pick<DemoSnapshot,'products'|'catalogDetails'|'offers'>,variant:DemoProductVariant,reference:OfferInstant):OfferEvaluation{
  const lifecycle=this.lifecycle.execute(row,reference),issue=this.validate.execute(row,snapshot,variant,reference),result=(eligibility:OfferEligibility,issue:OfferIssue,projected:number|null=null):OfferEvaluation=>({offer:row,variant,lifecycle,eligibility,issue,projected});
  if(issue!==OfferIssue.None&&issue!==OfferIssue.Legacy)return result(issue===OfferIssue.Unknown?OfferEligibility.Unknown:OfferEligibility.Rejected,issue);
  const product=snapshot.products.find(value=>value.sku===row.sku)!,presentation=CatalogDetailsRead.presentation(snapshot,row.sku,variant)!;const legacy=row.source===OfferSource.LegacyPreserved,bps=legacy?(row.legacy?.percent===null?null:(row.legacy?.percent??Number.NaN)*100):row.discountBps;
  if(bps===null||!Number.isSafeInteger(bps)||!legacy&&(bps<1||bps>9900))return result(legacy?OfferEligibility.NotEvaluable:OfferEligibility.Rejected,legacy?OfferIssue.Legacy:OfferIssue.Discount);
  const discounted=this.discount.execute(presentation.pricing===CatalogPricingBasis.LegacySurcharge?product.price:presentation.price,bps,legacy),amount=discounted===null?null:discounted+(presentation.pricing===CatalogPricingBasis.LegacySurcharge?variant.extraUnit:0);const projected=amount!==null&&Number.isSafeInteger(amount)&&amount>0?amount:null;
  if(projected===null)return result(legacy?OfferEligibility.NotEvaluable:OfferEligibility.Rejected,legacy?OfferIssue.Legacy:OfferIssue.Money);
  if(legacy)return result(OfferEligibility.NotEvaluable,OfferIssue.Legacy,projected);
  if(row.cost===null||row.floor===null||row.minMarginBps===null)return result(OfferEligibility.NotEvaluable,row.cost===null?OfferIssue.CostMissing:row.floor===null?OfferIssue.FloorMissing:OfferIssue.MarginMissing,projected);
  if(!Number.isSafeInteger(row.cost)||row.cost<0||!Number.isSafeInteger(row.floor)||row.floor<0||!Number.isSafeInteger(row.minMarginBps)||row.minMarginBps<0||row.minMarginBps>10000)return result(OfferEligibility.Rejected,OfferIssue.Inputs);
  if(projected<row.floor)return result(OfferEligibility.Rejected,OfferIssue.Floor,projected);
  if((BigInt(projected)-BigInt(row.cost))*10000n<BigInt(projected)*BigInt(row.minMarginBps))return result(OfferEligibility.Rejected,OfferIssue.Margin,projected);
  return result(OfferEligibility.Evaluated,OfferIssue.None,projected);
 }
}
export class RankOffersStep {
 execute(rows:readonly OfferEvaluation[]):OfferEvaluation[]{return rows.filter(row=>row.offer.source===OfferSource.Policy&&row.lifecycle===OfferLifecycle.Active&&row.eligibility===OfferEligibility.Evaluated).slice().sort((a,b)=>b.offer.priority-a.offer.priority||(b.offer.discountBps??0)-(a.offer.discountBps??0)||(OfferInstant.fromWire(a.offer.startsAt).time===OfferInstant.fromWire(b.offer.startsAt).time?0:OfferInstant.fromWire(a.offer.startsAt).time!>OfferInstant.fromWire(b.offer.startsAt).time!?-1:1)||(a.offer.id<b.offer.id?-1:a.offer.id>b.offer.id?1:0));}
}
export interface OfferQuote {unit:number|null;source:OfferPriceSource;offerId:string|null;}
/** A pending revision is effective only at its start with current evaluable inputs. Reading never pauses a record. */
export class ResolveOfferReplacementStep {
 execute(row:DemoOffer,snapshot:Pick<DemoSnapshot,'products'|'catalogDetails'|'offers'|'offerReference'>):OfferReplacement{if(row.revisionOf===null)return OfferReplacement.None;if(row.activation===OfferActivation.Unknown||row.source===OfferSource.Unknown||row.variant===DemoProductVariant.Unknown)return OfferReplacement.Unknown;if(row.activation!==OfferActivation.Enabled)return OfferReplacement.Pending;const reference=OfferInstant.fromWire(snapshot.offerReference),start=OfferInstant.fromWire(row.startsAt);if(reference.time===null||start.time===null)return OfferReplacement.Blocked;const variants=CatalogDetailsRead.detail(snapshot,row.sku)?.variants.filter(value=>value.state===VariantSaleState.Active&&(row.variant===null||row.variant===value.variant))??[];if(!variants.some(value=>new EvaluateOfferMarginFloorStep().execute(row,snapshot,value.variant,reference).eligibility===OfferEligibility.Evaluated))return OfferReplacement.Blocked;return reference.time<start.time?OfferReplacement.Pending:OfferReplacement.Effective;}
}
export class QuoteOffersStep {
 private readonly evaluate=new EvaluateOfferMarginFloorStep();private readonly rank=new RankOffersStep();private readonly lifecycle=new OfferLifecycleStep();
 execute(snapshot:Pick<DemoSnapshot,'products'|'catalogDetails'|'offers'|'offerReference'>,product:DemoProduct,variant?:DemoProductVariant):OfferQuote{
  const detail=CatalogDetailsRead.detail(snapshot,product.sku),reference=OfferInstant.fromWire(snapshot.offerReference);if(!detail||!CatalogDetailsPolicy.known(detail)||!reference.known)return{unit:null,source:OfferPriceSource.Unknown,offerId:null};
  const superseded=new Set(snapshot.offers.filter(row=>new ResolveOfferReplacementStep().execute(row,snapshot)===OfferReplacement.Effective).map(row=>row.revisionOf));
  const quote=(selected:DemoProductVariant):OfferQuote=>{const presentation=detail.variants.find(value=>value.variant===selected);if(!presentation||presentation.state!==VariantSaleState.Active)return{unit:null,source:OfferPriceSource.Unknown,offerId:null};const scoped=snapshot.offers.filter(row=>!superseded.has(row.id)&&row.sku===product.sku&&(row.variant===null||row.variant===selected));const winner=this.rank.execute(scoped.map(row=>this.evaluate.execute(row,snapshot,selected,reference)))[0];if(winner)return{unit:winner.projected,source:OfferPriceSource.Policy,offerId:winner.offer.id};
   const legacy=scoped.filter(row=>row.source===OfferSource.LegacyPreserved&&row.activation===OfferActivation.Enabled).slice().sort((a,b)=>a.legacy!.position-b.legacy!.position).find(row=>this.lifecycle.execute(row,reference)===OfferLifecycle.Active);if(legacy){const evaluation=this.evaluate.execute(legacy,snapshot,selected,reference);return{unit:evaluation.projected,source:evaluation.projected===null?OfferPriceSource.Unknown:OfferPriceSource.Legacy,offerId:legacy.id};}return{unit:presentation.price,source:OfferPriceSource.Base,offerId:null};};
  if(variant)return quote(variant);return detail.variants.filter(value=>value.state===VariantSaleState.Active).map(value=>quote(value.variant)).reduce<OfferQuote>((best,row)=>row.unit!==null&&(best.unit===null||row.unit<best.unit)?row:best,{unit:null,source:OfferPriceSource.Unknown,offerId:null});
 }
}
