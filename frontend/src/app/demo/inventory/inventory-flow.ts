import type {DemoSnapshot,DemoProduct} from '../demo-model';
import {DemoContext} from '../demo-model';
import {UserRole} from '../../domain/user/user-role';
import {CatalogDetailsPolicy,CatalogDetailsRead} from '../rich-catalog/catalog-details';
import {InventoryOperation,InventoryPhase,InventoryPayload,type InventoryBalances} from './inventory-types';
export interface InventoryAuthority {context:DemoContext;role:UserRole;actor:string;epoch:number;readable:boolean;}
export class InventoryAccess {
 static permits(a:InventoryAuthority){return a.readable&&a.context===DemoContext.Admin&&[UserRole.Admin,UserRole.Operator].includes(a.role)&&!!a.actor;}
}
export class InventoryPool {
 static balances(snapshot:DemoSnapshot,p:DemoProduct):InventoryBalances|null{const d=CatalogDetailsRead.detail(snapshot,p.sku);if(!d)return null;try{CatalogDetailsPolicy.validate(d,p);}catch{return null;}if(![p.onHand,p.reserved].every(n=>Number.isSafeInteger(n)&&n>=0)||typeof p.active!=='boolean')return null;const sellable=CatalogDetailsRead.balance(snapshot,p);return sellable===null?null:{physical:p.onHand,reserved:p.reserved,notSellable:d.notSellable,sellable};}
 static totals(snapshot:DemoSnapshot):InventoryBalances|null{let result:InventoryBalances={physical:0,reserved:0,notSellable:0,sellable:0};for(const product of snapshot.products){const balance=this.balances(snapshot,product);if(!balance)return null;result={physical:result.physical+balance.physical,reserved:result.reserved+balance.reserved,notSellable:result.notSellable+balance.notSellable,sellable:result.sellable+balance.sellable};if(!Object.values(result).every(Number.isSafeInteger))return null;}return result;}
}
export interface InventoryCommand {id:string;sku:string;operation:InventoryOperation;quantity:number;reason:string;reference:string;actor:string;epoch:number;revision:number;}
export abstract class PhysicalStockStep {
 abstract readonly operation:InventoryOperation;protected abstract physical(before:number,quantity:number):number;
 payload(c:InventoryCommand){return InventoryPayload.encode(c.sku,c.operation,c.quantity,c.reason,c.reference);}
 proposal(s:DemoSnapshot,c:InventoryCommand):InventoryBalances|null{const p=s.products.find(p=>p.sku===c.sku);if(!p||c.operation!==this.operation||!Number.isSafeInteger(c.quantity)||!c.reason.trim()||c.reason.length>1000||c.reference.length>200||this.operation===InventoryOperation.Adjust&&c.quantity===0)return null;const before=InventoryPool.balances(s,p);if(!before)return null;const physical=this.physical(before.physical,c.quantity);if(!Number.isSafeInteger(physical)||physical<0||physical<before.reserved+before.notSellable)return null;const d=CatalogDetailsRead.detail(s,p.sku)!;try{CatalogDetailsPolicy.validate(d,{...p,onHand:physical});}catch{return null;}return{...before,physical,sellable:p.active?physical-before.reserved-before.notSellable:0};}
 execute(s:DemoSnapshot,a:InventoryAuthority,c:InventoryCommand,timestamp:string):InventoryPhase {
  if(!InventoryAccess.permits(a)||a.actor!==c.actor||a.epoch!==c.epoch)return InventoryPhase.Unauthorized;
  const existing=s.movements.find(m=>m.inventory?.commandId===c.id),payload=this.payload(c);
  if(existing)return existing.inventory?.operation===InventoryOperation.Unknown?InventoryPhase.Blocked:existing.inventory?.payload===payload&&existing.inventory.actor===a.actor&&existing.inventory.operation===this.operation?InventoryPhase.AlreadyApplied:InventoryPhase.Conflict;
  if(s.movements.some(m=>m.id===c.id))return InventoryPhase.Conflict;
  if(s.movements.some(m=>m.sku===c.sku&&m.inventory?.operation===InventoryOperation.Unknown))return InventoryPhase.Blocked;
  if(!c.id||!Number.isFinite(Date.parse(timestamp)))return InventoryPhase.Blocked;
  if(s.revision!==c.revision)return InventoryPhase.Conflict;
  const after=this.proposal(s,c),product=s.products.find(p=>p.sku===c.sku);if(!after||!product||!Number.isSafeInteger(s.revision+1))return InventoryPhase.Blocked;
  const before=InventoryPool.balances(s,product)!;product.onHand=after.physical;
  s.movements.push({id:c.id,sku:c.sku,delta:after.physical-before.physical,reason:c.reason.trim(),inventory:{operation:this.operation,commandId:c.id,payload,actor:a.actor,timestamp,reference:c.reference.trim(),quantity:c.quantity,before,after}});s.revision++;return InventoryPhase.Applied;
 }
}
export class AdjustPhysicalStockStep extends PhysicalStockStep {readonly operation=InventoryOperation.Adjust;protected physical(before:number,quantity:number){return before+quantity;}}
export class ReconcilePhysicalStockStep extends PhysicalStockStep {readonly operation=InventoryOperation.Reconcile;protected physical(_before:number,quantity:number){return quantity;}}
export const physicalStockSteps:readonly PhysicalStockStep[]=[new AdjustPhysicalStockStep(),new ReconcilePhysicalStockStep()];
