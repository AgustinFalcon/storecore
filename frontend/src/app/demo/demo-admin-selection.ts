import { DemoCampaign, DemoProduct } from './demo-model';
import { ProductPublication, ProductCondition } from './catalog/catalog-types';
import { DemoCampaignState } from './demo-config-types';

/** Closed filters own labels and predicates; presentation never switches wire strings. */
export class DemoAdminFilter {
  private constructor(readonly wire:string,readonly label:string,readonly product:(value:DemoProduct,available:number,threshold:number)=>boolean,readonly campaign:(value:DemoCampaign)=>boolean){}
  static readonly All=new DemoAdminFilter('all','Todos',()=>true,()=>true);
  static readonly Active=new DemoAdminFilter('active','Publicados / activos',value=>value.publication.published,value=>value.state.active);
  static readonly Archived=new DemoAdminFilter('archived','Archivados / pausados',value=>value.publication===ProductPublication.Archived,value=>value.state===DemoCampaignState.Paused);
  static readonly LowStock=new DemoAdminFilter('low','Stock bajo',(value,available,threshold)=>value.publication.published&&Number.isFinite(available)&&value.variants.some(variant=>variant.condition===ProductCondition.Standard&&variant.saleState.active&&variant.onHand-variant.reserved-variant.notSellable<threshold),()=>false);
  static readonly Unknown=new DemoAdminFilter('','Filtro desconocido',()=>false,()=>false);
  static readonly all=[this.All,this.Active,this.Archived,this.LowStock];
  static fromWire(raw:unknown):DemoAdminFilter{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class DemoAdminSort {
  private constructor(readonly wire:string,readonly label:string,readonly compare:(a:{name?:string;title?:string;id?:string;price?:number;total?:number;percent?:number},b:{name?:string;title?:string;id?:string;price?:number;total?:number;percent?:number})=>number){}
  static readonly Recent=new DemoAdminSort('recent','Más recientes',()=>0);
  static readonly Name=new DemoAdminSort('name','Nombre / referencia A–Z',(a,b)=>(a.name??a.title??a.id??'').localeCompare(b.name??b.title??b.id??''));
  static readonly Amount=new DemoAdminSort('amount','Mayor precio / total / descuento',(a,b)=>(b.price??b.total??b.percent??0)-(a.price??a.total??a.percent??0));
  static readonly Unknown=new DemoAdminSort('','Orden desconocido',()=>0);
  static readonly all=[this.Recent,this.Name,this.Amount];
  static fromWire(raw:unknown):DemoAdminSort{return this.all.find(value=>value.wire===raw)??this.Unknown;}
  apply<T extends {name?:string;title?:string;id?:string;price?:number;total?:number;percent?:number}>(values:readonly T[]):T[]{return this===DemoAdminSort.Unknown?[]:this===DemoAdminSort.Recent?[...values].reverse():[...values].sort(this.compare);}
}
export const DEMO_ADMIN_LIMIT=20;
