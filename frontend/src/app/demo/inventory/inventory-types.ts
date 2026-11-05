export class InventoryOperation {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Adjust=new InventoryOperation('ADJUST_PHYSICAL','Ajustar físico');static readonly Reconcile=new InventoryOperation('RECONCILE_PHYSICAL','Reconciliar conteo');static readonly Unknown=new InventoryOperation('','Tipo no disponible');
 static readonly all=[this.Adjust,this.Reconcile];static fromWire(raw:unknown){return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class InventoryPhase {
 private constructor(readonly label:string){}
 static readonly Editing=new InventoryPhase('Editar propuesta');static readonly Reviewing=new InventoryPhase('Revisar propuesta');static readonly Saving=new InventoryPhase('Guardando…');static readonly Applied=new InventoryPhase('Movimiento aplicado');static readonly AlreadyApplied=new InventoryPhase('Este movimiento ya estaba aplicado');static readonly Blocked=new InventoryPhase('Propuesta bloqueada: revisá cantidades y catálogo');static readonly Conflict=new InventoryPhase('Los datos cambiaron. Actualizá y revisá la propuesta');static readonly Failed=new InventoryPhase('No se pudo guardar. Conservamos la propuesta');static readonly Unauthorized=new InventoryPhase('Acceso denegado');static readonly Unknown=new InventoryPhase('Estado no reconocido');
}
export class InventoryValidation {
 private constructor(readonly label:string){}
 static readonly None=new InventoryValidation('');
 static readonly Invalid=new InventoryValidation('Revisá el tipo, las unidades enteras y el motivo. El físico debe cubrir stock reservado + stock no vendible y respetar el alcance del Catálogo.');
}
export class InventoryHealth {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Normal=new InventoryHealth('normal','Normal');static readonly Low=new InventoryHealth('low','Stock bajo');static readonly Out=new InventoryHealth('out','Agotado');static readonly Unknown=new InventoryHealth('unknown','Desconocido');static readonly all=[this.Normal,this.Low,this.Out,this.Unknown];
 static fromWire(raw:unknown){return this.all.find(v=>v.wire===raw)??this.Unknown;}
 static project(active:boolean,balance:number|null,threshold:number){return balance===null?this.Unknown:!active?null:balance===0?this.Out:balance<threshold?this.Low:this.Normal;}
}
export interface InventoryBalances {physical:number;reserved:number;notSellable:number;sellable:number;}
export interface InventoryAudit {operation:InventoryOperation;commandId:string;payload:string;actor:string;timestamp:string;reference:string;quantity:number;before:InventoryBalances;after:InventoryBalances;}
export class InventoryPayload {
 static encode(sku:string,operation:InventoryOperation,quantity:number,reason:string,reference:string){return JSON.stringify({sku,operation:operation.wire,quantity,reason:reason.trim(),reference:reference.trim()});}
}
const wire=(raw:unknown)=>raw&&typeof raw==='object'&&'wire'in raw?raw.wire:raw;
export class InventoryMovementCodec {
 static fromWire(raw:unknown):InventoryAudit|undefined {
  if(raw===undefined)return undefined;
  if(!raw||typeof raw!=='object')throw Error('Movimiento de inventario inválido.');
  const row=raw as InventoryAudit;
  const valid=(b:InventoryBalances)=>b&&[b.physical,b.reserved,b.notSellable,b.sellable].every(n=>Number.isSafeInteger(n)&&n>=0)&&Number.isSafeInteger(b.reserved+b.notSellable)&&b.physical>=b.reserved+b.notSellable&&(b.sellable===0||b.sellable===b.physical-b.reserved-b.notSellable);
  if(typeof row.commandId!=='string'||!row.commandId||typeof row.payload!=='string'||typeof row.actor!=='string'||!row.actor||typeof row.timestamp!=='string'||!Number.isFinite(Date.parse(row.timestamp))||typeof row.reference!=='string'||row.reference.length>200||row.reference!==row.reference.trim()||!Number.isSafeInteger(row.quantity)||!valid(row.before)||!valid(row.after)||row.before.reserved!==row.after.reserved||row.before.notSellable!==row.after.notSellable)throw Error('Evidencia de inventario inválida.');
  return{operation:InventoryOperation.fromWire(wire(row.operation)),commandId:row.commandId,payload:row.payload,actor:row.actor,timestamp:row.timestamp,reference:row.reference,quantity:row.quantity,before:{...row.before},after:{...row.after}};
 }
 static validateEnvelope(audit:InventoryAudit,sku:string,delta:number,reason:string){
  if((audit.before.sellable>0||audit.after.sellable>0)&&(audit.before.sellable!==audit.before.physical-audit.before.reserved-audit.before.notSellable||audit.after.sellable!==audit.after.physical-audit.after.reserved-audit.after.notSellable))throw Error('Saldos disponibles incoherentes.');
  if(audit.operation===InventoryOperation.Unknown)return;
  if(audit.payload!==InventoryPayload.encode(sku,audit.operation,audit.quantity,reason,audit.reference)||!reason.trim()||reason!==reason.trim()||reason.length>1000||audit.operation===InventoryOperation.Adjust&&(audit.quantity===0||audit.quantity!==delta)||audit.operation===InventoryOperation.Reconcile&&(audit.quantity<0||audit.quantity!==audit.after.physical))throw Error('Propuesta de inventario incoherente.');
 }
}
