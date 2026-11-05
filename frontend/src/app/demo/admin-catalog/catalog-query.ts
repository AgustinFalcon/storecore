import { CatalogPublicationFilter,CatalogStockFilter,ProductPublication,CatalogAvailability,CatalogPriceSource } from './catalog-types';
import type { DemoProduct,DemoSnapshot } from '../demo-model';
import { CatalogDetailsRead } from '../rich-catalog/catalog-details';
export const normalizeCatalogSearch=(value:string)=>value.trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es-AR');
export class AdminCatalogCriteria {
  private constructor(readonly q:string,readonly publication:CatalogPublicationFilter,readonly stock:CatalogStockFilter,readonly brand:string,readonly category:string,readonly page:number,readonly valid:boolean){}
  static fromWire(raw:{q?:unknown;publication?:unknown;stock?:unknown;brand?:unknown;category?:unknown;page?:unknown}):AdminCatalogCriteria{
    const q=typeof raw.q==='string'?raw.q:'',brand=typeof raw.brand==='string'?raw.brand:'',category=typeof raw.category==='string'?raw.category:'',publication=raw.publication==null?CatalogPublicationFilter.All:CatalogPublicationFilter.fromWire(raw.publication),stock=raw.stock==null?CatalogStockFilter.All:CatalogStockFilter.fromWire(raw.stock),page=typeof raw.page==='string'&&/^[1-9]\d*$/.test(raw.page)?Number(raw.page)-1:0;
    const valid=q.length<=120&&brand.length<=80&&category.length<=80&&publication!==CatalogPublicationFilter.Unknown&&stock!==CatalogStockFilter.Unknown&&(raw.page==null||typeof raw.page==='string'&&/^[1-9]\d*$/.test(raw.page)&&Number.isSafeInteger(page));return new AdminCatalogCriteria(q.slice(0,120),publication,stock,brand.slice(0,80),category.slice(0,80),page,valid);
  }
  get query():Record<string,string>{return{...(this.q?{q:this.q}:{}),...(this.publication!==CatalogPublicationFilter.All?{publication:this.publication.wire}:{}),...(this.stock!==CatalogStockFilter.All?{stock:this.stock.wire}:{}),...(this.brand?{brand:this.brand}:{}),...(this.category?{category:this.category}:{}),...(this.page?{page:String(this.page+1)}:{})};}
  get hasFilters():boolean{return !!this.q||!!this.brand||!!this.category||this.publication!==CatalogPublicationFilter.All||this.stock!==CatalogStockFilter.All;}
}
export interface AdminCatalogRow {product:DemoProduct;publication:ProductPublication;available:number|null;current:number|null;availability:CatalogAvailability;priceSource:CatalogPriceSource;}
export class ProjectCatalogRowsStep {
  execute(snapshot:DemoSnapshot,price:(sku:string)=>number):AdminCatalogRow[]{return snapshot.products.map(product=>{let current:number|null;try{const amount=price(product.sku);current=Number.isSafeInteger(amount)&&amount>0?amount:null;}catch{current=null;}const publication=ProductPublication.fromWire(product.active),available=CatalogDetailsRead.balance(snapshot,product);return{product,publication,available,current,availability:CatalogAvailability.resolve(publication,available,snapshot.settings.lowStockThreshold),priceSource:CatalogPriceSource.resolve(product.price,current)};});}
}
export class FilterCatalogRowsStep {
  execute(rows:readonly AdminCatalogRow[],criteria:AdminCatalogCriteria,threshold:number):AdminCatalogRow[]{const q=normalizeCatalogSearch(criteria.q);return !criteria.valid?[]:rows.filter(row=>(criteria.publication===CatalogPublicationFilter.All||criteria.publication.publication===row.publication)&&criteria.stock.matches(row.available,row.publication,threshold)&&(!criteria.brand||criteria.brand===row.product.brand)&&(!criteria.category||criteria.category===row.product.category)&&(!q||normalizeCatalogSearch(row.product.sku+' '+row.product.name+' '+row.product.brand).includes(q)));}
}
export class PageCatalogRowsStep {
  readonly size=6;
  execute(rows:readonly AdminCatalogRow[],criteria:AdminCatalogCriteria){const pageCount=Math.max(1,Math.ceil(rows.length/this.size)),page=Math.min(criteria.page,pageCount-1);return{rows:rows.slice(page*this.size,(page+1)*this.size),page,pageCount,start:rows.length?page*this.size+1:0,end:Math.min((page+1)*this.size,rows.length),count:rows.length,outOfRange:page!==criteria.page};}
}
