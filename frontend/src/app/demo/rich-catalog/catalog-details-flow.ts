import type { DemoProduct,DemoSnapshot } from '../demo-model';
import { DemoProductVariant } from '../catalog/product-variant';
import { PaymentStatus } from '../../domain/order/commerce-states';
import { CatalogDetailError,CatalogDetailIssue,CatalogPricingBasis,CatalogCompareAt } from './catalog-details-types';
import { CatalogDetailsPolicy,MigrateCatalogV4ToV5Step,type CatalogDetails } from './catalog-details';
import { VariantSaleState } from '../catalog/catalog-types';
/** Compatibility writes update the additive metadata in the same existing transaction. */
export class SyncCatalogDetailsAfterBasicSaveStep {
  execute(snapshot:DemoSnapshot,product:DemoProduct,previous?:DemoProduct):void{
    const current=snapshot.catalogDetails?.find(value=>value.sku===product.sku);snapshot.catalogDetails??=[];
    if(!current){snapshot.catalogDetails.push(new MigrateCatalogV4ToV5Step().execute([product])[0]);return;}
    const next=CatalogDetailsPolicy.clone(current),standard=next.variants.find(value=>value.variant===DemoProductVariant.Standard)!;
    standard.price=product.price;standard.original=product.original;standard.comparison=CatalogCompareAt.Known;
    const caseVariant=next.variants.find(value=>value.variant===DemoProductVariant.Case);
    if(!product.supportsCase)next.variants=next.variants.filter(value=>value.variant!==DemoProductVariant.Case);
    else if(!caseVariant)next.variants.push(new MigrateCatalogV4ToV5Step().execute([product])[0].variants.find(value=>value.variant===DemoProductVariant.Case)!);
    else if(previous&&caseVariant.pricing===CatalogPricingBasis.LegacySurcharge){const migrated=new MigrateCatalogV4ToV5Step().execute([product])[0].variants.find(value=>value.variant===DemoProductVariant.Case)!;caseVariant.price=migrated.price;caseVariant.original=migrated.original;caseVariant.comparison=migrated.comparison;}
    CatalogDetailsPolicy.validate(next,product,true);snapshot.catalogDetails=snapshot.catalogDetails.map(value=>value.sku===product.sku?next:value);
  }
}
export const catalogDetailsFingerprint=(detail:CatalogDetails)=>JSON.stringify(detail);
export class ValidateCatalogDetailsChangeStep {
  execute(snapshot:DemoSnapshot,product:DemoProduct,proposed:CatalogDetails,expected:string|null):void{
    CatalogDetailsPolicy.validate(proposed,product);
    if(proposed.outlet&&snapshot.catalogDetails.some(value=>value.sku!==product.sku&&value.outlet?.reference===proposed.outlet?.reference))throw new CatalogDetailError(CatalogDetailIssue.Outlet);
    const previous=snapshot.catalogDetails.find(value=>value.sku===product.sku);
    if(previous&&(!CatalogDetailsPolicy.known(previous)||catalogDetailsFingerprint(previous)!==expected)||!previous&&expected!==null)throw new CatalogDetailError(CatalogDetailIssue.Conflict);
    if(!previous)return;
    if(previous.notSellable!==proposed.notSellable)throw new CatalogDetailError(CatalogDetailIssue.Stock);
    if(previous.kind!==proposed.kind||previous.outlet?.reference!==proposed.outlet?.reference||previous.outlet?.scope!==proposed.outlet?.scope)throw new CatalogDetailError(CatalogDetailIssue.Outlet);
    for(const current of previous.variants){const next=proposed.variants.find(value=>value.variant===current.variant);if(!next)throw new CatalogDetailError(CatalogDetailIssue.Variant);const inUse=snapshot.actors.some(actor=>actor.cart.some(line=>line.sku===product.sku&&line.variant===current.variant))||snapshot.orders.some(order=>order.payment===PaymentStatus.Pending&&order.lines.some(line=>line.sku===product.sku&&line.variant===current.variant));if(inUse&&(next.state!==VariantSaleState.Active||previous.condition!==proposed.condition||previous.outlet?.defects!==proposed.outlet?.defects))throw new CatalogDetailError(CatalogDetailIssue.Reserved);}
  }
}
