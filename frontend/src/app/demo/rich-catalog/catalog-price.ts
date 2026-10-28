import type { DemoCampaign,DemoProduct,DemoSnapshot } from '../demo-model';
import { DemoProductVariant } from '../catalog/product-variant';
import { VariantSaleState } from '../catalog/catalog-types';
import { CatalogDetailsPolicy,CatalogDetailsRead,type CatalogPresentation } from './catalog-details';
import { CatalogPricingBasis } from './catalog-details-types';
/** Integer percentage arithmetic never multiplies a MAX_SAFE amount by 100. */
export class ApplyCatalogOfferStep {
  execute(base:number,offer:DemoCampaign|undefined):number|null{if(!Number.isSafeInteger(base)||base<1)return null;if(!offer)return base;const percent=offer.percent;if(!Number.isSafeInteger(percent)||percent<0||percent>100)return null;const remainder=base%100,amount=(base-remainder)/100*(100-percent)+Math.round(remainder*(100-percent)/100);return Number.isSafeInteger(amount)?Math.max(1,amount):null;}
}
export class QuoteCatalogPresentationStep {
  private readonly apply=new ApplyCatalogOfferStep();
  execute(snapshot:Pick<DemoSnapshot,'catalogDetails'|'campaigns'>,product:DemoProduct,now:string,variant?:DemoProductVariant):number|null{
    const offer=snapshot.campaigns.find(value=>value.sku===product.sku&&value.active&&value.from<=now.slice(0,10)&&value.until>=now.slice(0,10)),detail=CatalogDetailsRead.detail(snapshot,product.sku);
    if(!detail)return this.apply.execute(product.price,offer);
    if(!CatalogDetailsPolicy.known(detail))return null;
    const quote=(presentation:CatalogPresentation):number|null=>{if(presentation.state!==VariantSaleState.Active)return null;const base=presentation.pricing===CatalogPricingBasis.LegacySurcharge?this.apply.execute(product.price,offer):this.apply.execute(presentation.price,offer);if(base===null)return null;const amount=base+(presentation.pricing===CatalogPricingBasis.LegacySurcharge?presentation.variant.extraUnit:0);return Number.isSafeInteger(amount)&&amount>0?amount:null;};
    if(variant){const selected=detail.variants.find(value=>value.variant===variant);return selected?quote(selected):null;}
    return detail.variants.reduce<number|null>((lowest,presentation)=>{const amount=quote(presentation);return amount===null?lowest:lowest===null?amount:Math.min(lowest,amount);},null);
  }
}
