import { UserRole } from '../../domain/user/user-role';
import { DemoContext,DemoModuleId,DemoProductVariant,type DemoProduct,type DemoSnapshot } from '../demo-model';
import { PaymentStatus } from '../../domain/order/commerce-states';
import { CatalogProductPolicy } from './catalog-policy';
import { CatalogIssue,CatalogValidationError,ProductPublication } from './catalog-types';
export interface CatalogAuthority {context:DemoContext;role:UserRole;actor:string;expectedActor:string;epoch:number;expectedEpoch:number;readable:boolean;}
export class AuthorizeCatalogStep {
  permits(authority:CatalogAuthority,snapshot:DemoSnapshot):boolean{if(!authority.readable||authority.context!==DemoContext.Admin||!authority.role.isKnown||typeof authority.actor!=='string'||!authority.actor||authority.actor!==authority.expectedActor||authority.epoch!==authority.expectedEpoch)return false;const modules=snapshot.modules.filter(row=>row.id===DemoModuleId.Catalog);return modules.length===1&&modules[0].enabled===true;}
  execute(authority:CatalogAuthority,snapshot:DemoSnapshot):void{if(!this.permits(authority,snapshot))throw new CatalogValidationError(CatalogIssue.Authority);}
}
export const catalogFingerprint=(product:DemoProduct)=>JSON.stringify(product);
export class SaveCatalogProductStep {
  private readonly authorize=new AuthorizeCatalogStep();private readonly policy=new CatalogProductPolicy();
  execute(snapshot:DemoSnapshot,authority:CatalogAuthority,product:DemoProduct,editing:string|null,expected:string|null):boolean{
    this.authorize.execute(authority,snapshot);this.policy.validate(product,DemoProductVariant.Case.extraUnit);const existing=snapshot.products.find(row=>row.sku===(editing??product.sku));
    if(editing){if(!existing||editing!==product.sku||catalogFingerprint(existing)!==expected)throw new CatalogValidationError(CatalogIssue.Conflict);
      if(product.onHand!==existing.onHand||product.reserved!==existing.reserved||product.active!==existing.active)throw new CatalogValidationError(CatalogIssue.Stock);
      if(existing.supportsCase&&!product.supportsCase&&(snapshot.actors.some(actor=>actor.cart.some(line=>line.sku===existing.sku&&line.variant===DemoProductVariant.Case))||snapshot.orders.some(order=>order.payment===PaymentStatus.Pending&&order.lines.some(line=>line.sku===existing.sku&&line.variant===DemoProductVariant.Case))))throw new CatalogValidationError(CatalogIssue.Case);
      if(catalogFingerprint(product)===catalogFingerprint(existing))return false;snapshot.products=snapshot.products.map(row=>row===existing?{...product}:row);
    }else{if(existing)throw new CatalogValidationError(CatalogIssue.SKU);if(product.onHand!==0||product.reserved!==0||ProductPublication.fromWire(product.active)!==ProductPublication.Published)throw new CatalogValidationError(CatalogIssue.Stock);snapshot.products.push({...product});}
    snapshot.revision++;return true;
  }
}
export class SetCatalogPublicationStep {
  private readonly authorize=new AuthorizeCatalogStep();private readonly policy=new CatalogProductPolicy();
  execute(snapshot:DemoSnapshot,authority:CatalogAuthority,sku:string,target:ProductPublication,expected:string):boolean{
    this.authorize.execute(authority,snapshot);const product=snapshot.products.find(row=>row.sku===sku);if(!product||target===ProductPublication.Unknown)throw new CatalogValidationError(CatalogIssue.Unknown);
    if(ProductPublication.fromWire(product.active)===target)return false;if(catalogFingerprint(product)!==expected)throw new CatalogValidationError(CatalogIssue.Conflict);this.policy.validate(product,DemoProductVariant.Case.extraUnit);
    if(target===ProductPublication.Archived&&product.reserved>0)throw new CatalogValidationError(CatalogIssue.Reserved);
    product.active=target.active===true;snapshot.revision++;return true;
  }
}
