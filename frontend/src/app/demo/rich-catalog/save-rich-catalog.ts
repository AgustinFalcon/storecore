import type { DemoProduct,DemoSnapshot } from '../demo-model';
import { AuthorizeCatalogStep,SaveCatalogProductStep,type CatalogAuthority } from '../admin-catalog/catalog-flow';
import { CatalogDetailsPolicy,type CatalogDetails } from './catalog-details';
import { ValidateCatalogDetailsChangeStep,catalogDetailsFingerprint } from './catalog-details-flow';
import { CatalogProductPolicy } from '../admin-catalog/catalog-policy';
import { DemoProductVariant } from '../catalog/product-variant';
/** Orchestrates existing authority/basic save and additive metadata as one candidate transaction. */
export class SaveRichCatalogProductStep {
  private readonly authorize=new AuthorizeCatalogStep();private readonly validate=new ValidateCatalogDetailsChangeStep();private readonly basic=new SaveCatalogProductStep();
  execute(snapshot:DemoSnapshot,authority:CatalogAuthority,product:DemoProduct,detail:CatalogDetails,editing:string|null,expectedProduct:string|null,expectedDetail:string|null):boolean{
    this.authorize.execute(authority,snapshot);new CatalogProductPolicy().validate(product,DemoProductVariant.Case.extraUnit);this.validate.execute(snapshot,product,detail,expectedDetail);
    const current=snapshot.catalogDetails.find(value=>value.sku===product.sku),detailChanged=!current||catalogDetailsFingerprint(current)!==catalogDetailsFingerprint(detail);
    const productChanged=this.basic.execute(snapshot,authority,product,editing,expectedProduct);
    if(detailChanged){snapshot.catalogDetails=snapshot.catalogDetails.map(value=>value.sku===product.sku?CatalogDetailsPolicy.clone(detail):value);if(!productChanged)snapshot.revision++;}
    return productChanged||detailChanged;
  }
}
