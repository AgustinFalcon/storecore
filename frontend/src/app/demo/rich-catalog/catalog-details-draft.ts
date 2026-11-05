import { DemoProductVariant } from '../catalog/product-variant';
import type { DemoProduct } from '../demo-model';
import { CatalogProductPolicy } from '../admin-catalog/catalog-policy';
import { CatalogIssue } from '../admin-catalog/catalog-types';
import { CatalogDetailsPolicy,type CatalogDetails } from './catalog-details';
import { CatalogPricingBasis,CatalogCompareAt } from './catalog-details-types';
import { CatalogDetailError,CatalogDetailIssue } from './catalog-details-types';
/** Form buffer only; never shares arrays with the persisted snapshot. */
export class CatalogDetailsDraft {
  readonly value:CatalogDetails;caseBase='';caseOriginal='';
  constructor(detail:CatalogDetails){this.value=CatalogDetailsPolicy.clone(detail);const row=this.value.variants.find(value=>value.variant===DemoProductVariant.Case);if(row){this.caseBase=new CatalogProductPolicy().formatPrice(row.price);this.caseOriginal=row.original===null?'':new CatalogProductPolicy().formatPrice(row.original);}}
  serialize(product:DemoProduct):CatalogDetails{const detail=CatalogDetailsPolicy.clone(this.value),standard=detail.variants.find(value=>value.variant===DemoProductVariant.Standard)!;detail.sku=product.sku;standard.price=product.price;standard.original=product.original;standard.comparison=CatalogCompareAt.Known;const row=detail.variants.find(value=>value.variant===DemoProductVariant.Case);if(row){try{row.price=row.pricing===CatalogPricingBasis.LegacySurcharge?product.price+row.variant.extraUnit:new CatalogProductPolicy().parsePrice(this.caseBase);}catch{throw new CatalogDetailError(CatalogDetailIssue.CaseBase);}try{const original=row.pricing===CatalogPricingBasis.LegacySurcharge?product.original+row.variant.extraUnit:new CatalogProductPolicy().parsePrice(this.caseOriginal,CatalogIssue.Original);row.original=Number.isSafeInteger(original)?original:null;row.comparison=row.original===null?CatalogCompareAt.Unavailable:CatalogCompareAt.Known;}catch{throw new CatalogDetailError(CatalogDetailIssue.CaseOriginal);}if(row.original!==null&&row.original<row.price)throw new CatalogDetailError(CatalogDetailIssue.CaseOriginal);}return detail;}
}
