import type { DemoSnapshot,DemoProduct } from '../demo-model';
import { DemoProductVariant } from '../catalog/product-variant';
import { OutletScope,ProductCondition,VariantSaleState } from '../catalog/catalog-types';
import { CatalogDetailsPolicy,MigrateCatalogV4ToV5Step,type CatalogDetails } from './catalog-details';
import { ItemCondition,CatalogPricingBasis } from './catalog-details-types';
/** New-installation specimens only. Never called while decoding/migrating existing storage. */
export class EnrichCatalogDemoSeedStep {
  execute(snapshot:DemoSnapshot):DemoSnapshot{
    const first=snapshot.catalogDetails.find(value=>value.sku==='DEMO-001')!;
    first.condition=ItemCondition.New;first.warrantyTerms='Condiciones comerciales no definidas en esta demostración. Consultá antes de una compra real.';
    first.media=[{id:first.sku+'-front',assetId:'DEMO-001',alt:'Ilustración Demo de un taladro nuevo; no es fotografía de una unidad real'},{id:first.sku+'-detail',assetId:'DEMO-001-detail',alt:'Detalle ilustrado del cuerpo del taladro Demo; no es fotografía ni evidencia de condición'}];
    snapshot.catalogDetails.find(value=>value.sku==='DEMO-002')!.variants.find(value=>value.variant===DemoProductVariant.Case)!.state=VariantSaleState.Disabled;
    const own=snapshot.catalogDetails.find(value=>value.sku==='DEMO-004')!.variants.find(value=>value.variant===DemoProductVariant.Case)!;own.price=3925500;own.original=4200000;own.pricing=CatalogPricingBasis.OwnBase;
    snapshot.catalogDetails.find(value=>value.sku==='DEMO-005')!.variants.find(value=>value.variant===DemoProductVariant.Standard)!.state=VariantSaleState.Disabled;
    this.outlet(snapshot,'VLD-043','Taladro Outlet retenido',1,1,OutletScope.Unit,ItemCondition.Used,'UNIT-RETAINED-043');
    this.outlet(snapshot,'OUT-UNIT-01','Taladro reacondicionado · unidad Demo',1,0,OutletScope.Unit,ItemCondition.Reconditioned,'UNIT-DEMO-01');
    this.outlet(snapshot,'OUT-LOT-02','Taladro usado · lote Demo',2,0,OutletScope.Lot,ItemCondition.Used,'LOT-DEMO-02');
    return snapshot;
  }
  private media(sku:string):CatalogDetails['media']{return[
    {id:sku+'-main',assetId:'outlet-drill-main',alt:'Imagen simulada: equipo de taladro y estuche con marcas superficiales de uso'},
    {id:sku+'-case',assetId:'outlet-drill-case',alt:'Imagen simulada: detalle del estuche con abolladura y marcas superficiales'},
    {id:sku+'-body',assetId:'outlet-drill-body',alt:'Imagen simulada: detalle del cuerpo del taladro con marcas de uso en la empuñadura'}];}
  private outlet(snapshot:DemoSnapshot,sku:string,name:string,physical:number,notSellable:number,scope:OutletScope,condition:ItemCondition,reference:string):void{
    const product:DemoProduct={sku,name,brand:'Espécimen Demo',category:'Outlet',description:'Artículo ficticio para demostrar condiciones específicas por unidad o lote. No representa una evaluación ni un artículo real.',price:7190000,original:9500000,onHand:physical,reserved:0,active:true,tone:'#667b94',variant:DemoProductVariant.Standard.label,supportsCase:false};
    const detail=new MigrateCatalogV4ToV5Step().execute([product])[0];detail.kind=ProductCondition.Outlet;detail.condition=condition;detail.media=this.media(sku);detail.notSellable=notSellable;detail.outlet={scope,reference,notes:condition.label+' — espécimen simulado, sin verificación técnica real.'+(notSellable?' Retenido: no habilitado para compra.':''),defects:'Abolladura en el estuche y marcas superficiales en la empuñadura representadas por imágenes simuladas.',};detail.warrantyTerms='Términos ficticios: no se declara un plazo comercial ni una garantía verificada. Reemplazar por condiciones reales antes de publicar.';
    CatalogDetailsPolicy.validate(detail,product);snapshot.products.push(product);snapshot.catalogDetails.push(detail);
  }
}
