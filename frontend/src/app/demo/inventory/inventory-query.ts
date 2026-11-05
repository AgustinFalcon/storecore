import type {DemoProduct,DemoSnapshot} from '../demo-model';
import {ProductPublication,ProductCondition} from '../catalog/catalog-types';
import {CatalogDetailsRead} from '../rich-catalog/catalog-details';
import {InventoryHealth} from './inventory-types';
import {InventoryPool} from './inventory-flow';
export class InventoryAxis {
 private constructor(readonly wire:string,readonly label:string,readonly values:readonly {wire:string;label:string}[],readonly read:(s:DemoSnapshot,p:DemoProduct)=>{wire:string;label:string}|null){}
 static readonly Health=new InventoryAxis('health','Salud',InventoryHealth.all,(s,p)=>InventoryHealth.project(p.active,InventoryPool.balances(s,p)?.sellable??null,s.settings.lowStockThreshold));
 static readonly Publication=new InventoryAxis('publication','Publicación',ProductPublication.all,(_,p)=>ProductPublication.fromWire(p.active));
 static readonly Condition=new InventoryAxis('condition','Condición',ProductCondition.all,(s,p)=>CatalogDetailsRead.detail(s,p.sku)?.kind??ProductCondition.Unknown);
 static readonly all=[this.Health,this.Publication,this.Condition];
}
export class InventoryQuery {
 private constructor(readonly search:string,readonly filters:readonly {axis:InventoryAxis;value:{wire:string;label:string}|null;known:boolean}[]){}
 static fromWire(raw:Record<string,unknown>){return new InventoryQuery(typeof raw['q']==='string'?raw['q'].slice(0,200):'',InventoryAxis.all.map(axis=>{const input=raw[axis.wire],value=axis.values.find(value=>value.wire===input);return{axis,value:value??null,known:input===undefined||input===null||input===''||!!value};}));}
 get known(){return this.filters.every(f=>f.known);}get params(){return{q:this.search||null,...Object.fromEntries(this.filters.map(f=>[f.axis.wire,f.value?.wire??null]))};}
 execute(s:DemoSnapshot){return this.known?s.products.filter(p=>[p.sku,p.name].join(' ').toLocaleLowerCase().includes(this.search.trim().toLocaleLowerCase())&&this.filters.every(f=>!f.value||f.axis.read(s,p)===f.value)):[];}
}
export class InventoryDestination {
 private constructor(readonly path:string,readonly params:Record<string,string|null>){}
 static catalog(query:InventoryQuery,sku:string){return new InventoryDestination('/demo/user/catalog',{q:sku,inventoryReturn:JSON.stringify({...query.params,focus:sku})});}
 static order(query:InventoryQuery,id:string,sku:string){return new InventoryDestination('/demo/user/orders/'+id,{inventoryReturn:JSON.stringify({...query.params,focus:sku})});}
}
export class InventoryReturn {
 private constructor(readonly params:Record<string,string|null>){}
 readonly path='/demo/user/inventory';
 get wire(){return JSON.stringify(this.params);}
 static fromWire(raw:unknown):InventoryReturn|null{if(typeof raw!=='string'||raw.length>2000)return null;try{const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return null;const input=value as Record<string,unknown>,query=InventoryQuery.fromWire(input);return query.known?new InventoryReturn({...query.params,focus:typeof input['focus']==='string'?input['focus'].slice(0,100):null}):null;}catch{return null;}}
}
