import { ProductCondition } from './catalog-types';
import { ItemCondition } from '../rich-catalog/catalog-details-types';
import type { CatalogDetails } from '../rich-catalog/catalog-details';
/** Merchandising kind and physical condition remain independent axes. */
export class CatalogConditionFilter {
 private constructor(readonly wire:string,readonly label:string,private readonly accepts:(detail:CatalogDetails)=>boolean){}
 static readonly All=new CatalogConditionFilter('', 'Todos', ()=>true);
 static readonly New=new CatalogConditionFilter('new','Nuevo', detail=>detail.condition===ItemCondition.New);
 static readonly Outlet=new CatalogConditionFilter('outlet','Outlet', detail=>detail.kind===ProductCondition.Outlet);
 static readonly Reconditioned=new CatalogConditionFilter('reconditioned','Reacondicionado', detail=>detail.condition===ItemCondition.Reconditioned);
 static readonly Used=new CatalogConditionFilter('used','Usado', detail=>detail.condition===ItemCondition.Used);
 static readonly Unknown=new CatalogConditionFilter('unknown','Filtro no reconocido',()=>false);
 static readonly all=[this.All,this.New,this.Outlet,this.Reconditioned,this.Used];
 static fromWire(raw:unknown):CatalogConditionFilter{return raw==null?this.All:this.all.find(value=>value.wire===raw)??this.Unknown;}
 matches(detail:CatalogDetails|undefined):boolean{return !!detail&&detail.kind!==ProductCondition.Unknown&&detail.condition!==ItemCondition.Unknown&&(this===CatalogConditionFilter.All||detail.condition!==ItemCondition.Unspecified)&&this.accepts(detail);}
}
