import { CapabilityModuleState as Status } from '../../domain/user/capability-module-state';

export class CapabilityOperationFilter {
  private constructor(readonly label:string,private readonly status:Status|null,private readonly notApplicable=false){}
  static readonly All=new CapabilityOperationFilter('Todos',null);
  static readonly NotApplicable=new CapabilityOperationFilter('No aplica',null,true);
  static readonly Active=new CapabilityOperationFilter(Status.Active.label,Status.Active);
  static readonly Paused=new CapabilityOperationFilter(Status.Paused.label,Status.Paused);
  static readonly Unknown=new CapabilityOperationFilter(Status.Unknown.label,Status.Unknown);
  static readonly values=[this.All,this.NotApplicable,this.Active,this.Paused,this.Unknown];
  matches(status:Status|null):boolean{return this===CapabilityOperationFilter.All||(this.notApplicable?status===null:status===this.status);}
}

export class CapabilityTab {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Modules = new CapabilityTab('modules', 'Módulos');
  static readonly Technical = new CapabilityTab('technical', 'Configuración técnica');
  static readonly Unknown = new CapabilityTab('', 'Pestaña no reconocida');
  static fromWire(raw: unknown): CapabilityTab { return raw == null ? this.Modules : [this.Modules,this.Technical].find(t=>t.wire===raw)??this.Unknown; }
}
export class CapabilityCommandPhase {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Editing=new CapabilityCommandPhase('EDITING','Prepará el cambio');
  static readonly Reviewing=new CapabilityCommandPhase('REVIEWING','Revisá y confirmá el cambio');
  static readonly Saving=new CapabilityCommandPhase('SAVING','Guardando…');
  static readonly Confirmed=new CapabilityCommandPhase('CONFIRMED','Cambio confirmado');
  static readonly AlreadyApplied=new CapabilityCommandPhase('ALREADY_APPLIED','Este comando ya fue aplicado');
  static readonly Conflict=new CapabilityCommandPhase('CONFLICT','Los datos cambiaron. Conservamos la propuesta.');
  static readonly Uncertain=new CapabilityCommandPhase('UNCERTAIN','No pudimos verificar el resultado. Conservamos la propuesta.');
  static readonly Failed=new CapabilityCommandPhase('FAILED','No se guardó el cambio');
  static readonly Unauthorized=new CapabilityCommandPhase('UNAUTHORIZED','El contexto ya no permite este cambio');
  static readonly Unknown=new CapabilityCommandPhase('UNKNOWN','Resultado no reconocido');
  static readonly values=[this.Editing,this.Reviewing,this.Saving,this.Confirmed,this.AlreadyApplied,this.Conflict,this.Uncertain,this.Failed,this.Unauthorized];
  static fromWire(raw:unknown):CapabilityCommandPhase{return this.values.find(p=>p.wire===raw)??this.Unknown;}
}
export interface CapabilityProposal {readonly commandId:string;readonly actor:string;readonly epoch:number;readonly sessionGeneration:string;readonly current:Status;readonly proposed:Status;readonly expectedConfigVersion:number;readonly reason:string;}
export interface CapabilityReceipt {readonly commandId:string;readonly payload:string;readonly actor:string;readonly reason:string;readonly before:Status;readonly after:Status;readonly version:number;}
export interface CapabilityEvent {readonly commandId:string;readonly actor:string;readonly reason:string;readonly before:Status;readonly after:Status;readonly version:number;}
export interface CapabilityLedger {state:Status;configVersion:number|null;receipts:CapabilityReceipt[];events:CapabilityEvent[];}
const validToken=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value===value.trim();
const validReason=(value:unknown):value is string=>validToken(value)&&value.length<=500;
const validEpoch=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const wire=(raw:unknown):unknown=>raw&&typeof raw==='object'&&'wire' in raw?raw.wire:raw;
export class CapabilityLedgerCodec {
  static baseline():CapabilityLedger{return{state:Status.Active,configVersion:7,receipts:[],events:[]};}
  static fromWire(raw:unknown):CapabilityLedger{
    if(!raw||typeof raw!=='object'||!('state'in raw)||!('configVersion'in raw)||!('receipts'in raw)||!Array.isArray(raw.receipts)||!('events'in raw)||!Array.isArray(raw.events))throw Error('Ledger de módulos inválido.');
    const version=raw.configVersion;
    if(version!==null&&(!Number.isSafeInteger(version)||Number(version)<0))throw Error('Versión de módulos inválida.');
    const receipts=raw.receipts.map((r:unknown):CapabilityReceipt=>{
      if(!r||typeof r!=='object'||!('commandId'in r)||!validToken(r.commandId)||!('payload'in r)||typeof r.payload!=='string'||!('actor'in r)||!validToken(r.actor)||!('reason'in r)||!validReason(r.reason)||!('before'in r)||!('after'in r)||!('version'in r)||!Number.isSafeInteger(r.version))throw Error('Recibo de módulos inválido.');
      const before=Status.fromWire(wire(r.before)),after=Status.fromWire(wire(r.after));
      if(![Status.Active,Status.Paused].includes(before)||![Status.Active,Status.Paused].includes(after)||before===after)throw Error('Evento de módulos inválido.');
      return{commandId:r.commandId,payload:r.payload,actor:r.actor,reason:r.reason,before,after,version:Number(r.version)};
    });
    if(new Set(receipts.map(r=>r.commandId)).size!==receipts.length)throw Error('Recibo de módulos duplicado.');
    const state=Status.fromWire(wire(raw.state));
    if((receipts.length===0&&((state!==Status.Unknown&&(state!==Status.Active||version!==7))||(state===Status.Unknown&&version!==7&&version!==null)))||(receipts.length>0&&receipts[0].before!==Status.Active)||receipts.some((r,i)=>r.version!==8+i||(i>0&&r.before!==receipts[i-1].after))||(receipts.length>0&&(receipts.at(-1)!.version!==version||receipts.at(-1)!.after!==state)))throw Error('Ledger de módulos incoherente.');
    const events=raw.events.map((event:unknown):CapabilityEvent=>{if(!event||typeof event!=='object')throw Error('Evento inválido.');const e=event as Record<string,unknown>;if(typeof e['commandId']!=='string'||typeof e['actor']!=='string'||typeof e['reason']!=='string'||!Number.isSafeInteger(e['version']))throw Error('Evento inválido.');return{commandId:e['commandId'],actor:e['actor'],reason:e['reason'],before:Status.fromWire(wire(e['before'])),after:Status.fromWire(wire(e['after'])),version:e['version'] as number};});
    if(events.length!==receipts.length||events.some((event,i)=>{const{payload:_,...expected}=receipts[i];void _;return JSON.stringify(event)!==JSON.stringify(expected);}))throw Error('Eventos y recibos de módulos no coinciden.');
    for(const receipt of receipts){let payload:unknown;try{payload=JSON.parse(receipt.payload);}catch{throw Error('Payload de módulos inválido.');}if(!Array.isArray(payload)||payload.length!==7||payload[0]!==receipt.actor||!validEpoch(payload[1])||payload[2]!==receipt.before.wire||payload[3]!==receipt.after.wire||payload[4]!==receipt.version-1||payload[5]!==receipt.reason||!validToken(payload[6]))throw Error('Payload y recibo no coinciden.');}
    return{state,configVersion:version as number|null,receipts,events};
  }
}
export class ReviewCapabilityStep {
  execute(ledger:CapabilityLedger,actor:string,epoch:number,reason:string,id:string,sessionGeneration:string):CapabilityProposal{
    if(!validToken(actor)||!validToken(id)||!validToken(sessionGeneration)||!validEpoch(epoch)||!validReason(reason.trim())||!validEpoch(ledger.configVersion)||![Status.Active,Status.Paused].includes(ledger.state))throw Error('Indicá un motivo de hasta 500 caracteres y un estado conocido.');
    return Object.freeze({commandId:id,actor,epoch,sessionGeneration,reason:reason.trim(),current:ledger.state,proposed:ledger.state===Status.Active?Status.Paused:Status.Active,expectedConfigVersion:ledger.configVersion});
  }
}
export class CapabilityProposalCodec {
  static fromWire(raw:unknown):CapabilityProposal|null{
    if(!raw||typeof raw!=='object'||!('commandId'in raw)||!validToken(raw.commandId)||!('actor'in raw)||!validToken(raw.actor)||!('sessionGeneration'in raw)||!validToken(raw.sessionGeneration)||!('epoch'in raw)||!validEpoch(raw.epoch)||!('reason'in raw)||!validReason(raw.reason)||!('current'in raw)||!('proposed'in raw)||!('expectedConfigVersion'in raw)||!validEpoch(raw.expectedConfigVersion))return null;
    const current=Status.fromWire(wire(raw.current)),proposed=Status.fromWire(wire(raw.proposed));
    if(![Status.Active,Status.Paused].includes(current)||![Status.Active,Status.Paused].includes(proposed)||current===proposed||!raw.actor||!raw.reason.trim())return null;
    return{commandId:raw.commandId,actor:raw.actor,epoch:Number(raw.epoch),sessionGeneration:raw.sessionGeneration,reason:raw.reason,current,proposed,expectedConfigVersion:Number(raw.expectedConfigVersion)};
  }
}
export class ApplyCapabilityStep {
  static payload(p:CapabilityProposal):string{return JSON.stringify([p.actor,p.epoch,p.current.wire,p.proposed.wire,p.expectedConfigVersion,p.reason,p.sessionGeneration]);}
  execute(ledger:CapabilityLedger,p:CapabilityProposal):CapabilityCommandPhase{
    const payload=ApplyCapabilityStep.payload(p),previous=ledger.receipts.find(r=>r.commandId===p.commandId);
    if(previous)return previous.payload===payload?CapabilityCommandPhase.AlreadyApplied:CapabilityCommandPhase.Conflict;
    if(!validToken(p.commandId)||!validToken(p.sessionGeneration)||!validToken(p.actor)||!validReason(p.reason)||!validEpoch(p.epoch)||!validEpoch(p.expectedConfigVersion)||p.current===p.proposed||![Status.Active,Status.Paused].includes(p.current)||![Status.Active,Status.Paused].includes(p.proposed))return CapabilityCommandPhase.Failed;
    if(ledger.configVersion!==p.expectedConfigVersion||ledger.state!==p.current)return CapabilityCommandPhase.Conflict;
    ledger.state=p.proposed;ledger.configVersion=p.expectedConfigVersion+1;
    const event={commandId:p.commandId,actor:p.actor,reason:p.reason,before:p.current,after:p.proposed,version:ledger.configVersion};
    ledger.events.push(event);ledger.receipts.push({commandId:p.commandId,payload,actor:p.actor,reason:p.reason,before:p.current,after:p.proposed,version:ledger.configVersion});
    return CapabilityCommandPhase.Confirmed;
  }
}
