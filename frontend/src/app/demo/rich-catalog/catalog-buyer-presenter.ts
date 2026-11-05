import type { DemoProduct,DemoSnapshot } from '../demo-model';
import { DemoProductVariant } from '../catalog/product-variant';
import { VariantSaleState } from '../catalog/catalog-types';
import { CatalogDetailsPolicy,CatalogDetailsRead } from './catalog-details';
import { CatalogMediaRegistry } from './catalog-media';
import { CatalogCompareAt } from './catalog-details-types';
/** Pure card projection; comparative money always belongs to the same selected presentation. */
export class CatalogBuyerPresenter {
  execute(snapshot:Pick<DemoSnapshot,'catalogDetails'>,product:DemoProduct,price:(variant:DemoProductVariant)=>number){
    const detail=CatalogDetailsRead.detail(snapshot,product.sku),media=detail?.media[0],asset=media?CatalogMediaRegistry.find(media.assetId):undefined;
    const presentations=detail&&CatalogDetailsPolicy.known(detail)?detail.variants.filter(value=>value.state===VariantSaleState.Active).map(presentation=>({presentation,amount:price(presentation.variant)})).filter(value=>Number.isSafeInteger(value.amount)&&value.amount>0):[];
    const selected=presentations.reduce<typeof presentations[number]|undefined>((current,value)=>!current||value.amount<current.amount?value:current,undefined);
    return{detail,media,asset,condition:detail?[detail.kind.label,detail.condition.label].join(' · '):'Condición no informada',range:new Set(presentations.map(value=>value.amount)).size>1,amount:selected?.amount??Number.NaN,original:selected?.presentation.comparison===CatalogCompareAt.Known?selected.presentation.original:null};
  }
}
