import type { DemoProduct } from '../demo-model';
import { CatalogIssue,CatalogValidationError,ProductPublication } from './catalog-types';
export class CatalogProductPolicy {
  validate(product:DemoProduct,caseExtra:number):void{
    const fail=(issue:CatalogIssue):never=>{throw new CatalogValidationError(issue);};
    if(typeof product.sku!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(product.sku))fail(CatalogIssue.SKU);
    if(typeof product.name!=='string'||!product.name.trim()||product.name.length>160)fail(CatalogIssue.Name);
    if(typeof product.brand!=='string'||!product.brand.trim()||product.brand.length>80)fail(CatalogIssue.Brand);
    if(typeof product.category!=='string'||!product.category.trim()||product.category.length>80)fail(CatalogIssue.Category);
    if(typeof product.description!=='string'||product.description.length>2000)fail(CatalogIssue.Description);
    if(!Number.isSafeInteger(product.price)||product.price<1||product.supportsCase===true&&(!Number.isSafeInteger(caseExtra)||!Number.isSafeInteger(product.price+caseExtra)))fail(CatalogIssue.Base);
    if(!Number.isSafeInteger(product.original)||product.original<product.price)fail(CatalogIssue.Original);
    if(!Number.isSafeInteger(product.onHand)||!Number.isSafeInteger(product.reserved)||product.reserved<0||product.onHand<product.reserved)fail(CatalogIssue.Stock);
    if(product.active===false&&product.reserved>0)fail(CatalogIssue.Reserved);
    if(typeof product.active!=='boolean'||ProductPublication.fromWire(product.active)===ProductPublication.Unknown||typeof product.supportsCase!=='boolean'||typeof product.variant!=='string'||typeof product.tone!=='string')fail(CatalogIssue.Unknown);
  }
  parsePrice(raw:string,issue=CatalogIssue.Base):number{const value=raw.trim();if(!/^\d+(?:[.,]\d{1,2})?$/.test(value))throw new CatalogValidationError(issue);const [whole,fraction='']=value.replace(',','.').split('.'),minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(minor)||minor<1)throw new CatalogValidationError(issue);return minor;}
  formatPrice(value:number):string{if(!Number.isSafeInteger(value)||value<1)throw new CatalogValidationError(CatalogIssue.Base);const cents=value%100;return String((value-cents)/100)+'.'+String(cents).padStart(2,'0');}
}
