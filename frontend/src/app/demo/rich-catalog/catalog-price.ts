import type {DemoCampaign,DemoProduct,DemoSnapshot} from '../demo-model';
import {DemoProductVariant} from '../catalog/product-variant';
import {DiscountOfferMoneyStep,QuoteOffersStep} from '../offers/offer-pricing';
/** Historical percent adapter. Compatibility retains its minimum-one-cent rule. */
export class ApplyCatalogOfferStep {
 execute(base:number,offer:DemoCampaign|undefined):number|null{if(!offer)return Number.isSafeInteger(base)&&base>0?base:null;if(!Number.isSafeInteger(offer.percent)||offer.percent<0||offer.percent>100)return null;return new DiscountOfferMoneyStep().execute(base,offer.percent*100,true);}
}
export class QuoteCatalogPresentationStep {
 execute(snapshot:Pick<DemoSnapshot,'products'|'catalogDetails'|'campaigns'|'offers'|'offerReference'>,product:DemoProduct,reference:string,variant?:DemoProductVariant):number|null{void reference;return new QuoteOffersStep().execute(snapshot,product,variant).unit;}
}
