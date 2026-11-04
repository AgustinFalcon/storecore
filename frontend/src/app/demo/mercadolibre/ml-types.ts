export class MLAccountState {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Disconnected=new MLAccountState('DISCONNECTED','Desconectada');static readonly Connected=new MLAccountState('CONNECTED','Conectada · simulación local');static readonly Unknown=new MLAccountState('UNKNOWN','Cuenta desconocida');
 static fromWire(raw:unknown){return [this.Disconnected,this.Connected].find(v=>v.wire===wire(raw))??this.Unknown;}
}
export class MLMappingState {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Missing=new MLMappingState('MISSING','Sin mapping completo');static readonly Complete=new MLMappingState('COMPLETE','Mapping simulado completo');static readonly Unknown=new MLMappingState('UNKNOWN','Mapping desconocido');
 static fromWire(raw:unknown){return [this.Missing,this.Complete].find(v=>v.wire===wire(raw))??this.Unknown;}
}
export class MLIntentType {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Stock=new MLIntentType('STOCK','Stock');static readonly Price=new MLIntentType('PRICE','Precio de canal');static readonly Publication=new MLIntentType('PUBLICATION','Publicación');static readonly Unknown=new MLIntentType('UNKNOWN','Tipo desconocido');static readonly all=[this.Stock,this.Price,this.Publication];
 static fromWire(raw:unknown){return this.all.find(v=>v.wire===wire(raw))??this.Unknown;}
 valid(value:unknown){return this===MLIntentType.Publication?MLPublication.fromWire(value)!==MLPublication.Unknown:Number.isSafeInteger(value)&&Number(value)>=(this===MLIntentType.Price?1:0)&&this!==MLIntentType.Unknown;}
}
export class MLPublication {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Publish=new MLPublication('PUBLISH','Publicar');static readonly Pause=new MLPublication('PAUSE','Pausar');static readonly Unknown=new MLPublication('UNKNOWN','Publicación desconocida');static readonly all=[this.Publish,this.Pause];static fromWire(raw:unknown){return this.all.find(v=>v.wire===wire(raw))??this.Unknown;}
}
export class MLEventType {
 private constructor(readonly wire:string,readonly label:string,readonly terminal=false){}
 static readonly Queued=new MLEventType('QUEUED','En cola');static readonly Sent=new MLEventType('SENT','Enviado · simulación local');static readonly Confirmed=new MLEventType('SIMULATED_CONFIRMED','Confirmado simulado',true);static readonly Rejected=new MLEventType('SIMULATED_REJECTED','Rechazado simulado',true);static readonly Superseded=new MLEventType('SUPERSEDED','Superado',true);static readonly Unknown=new MLEventType('UNKNOWN','Evento desconocido',true);static readonly all=[this.Queued,this.Sent,this.Confirmed,this.Rejected,this.Superseded];static fromWire(raw:unknown){return this.all.find(v=>v.wire===wire(raw))??this.Unknown;}
 get retryable(){return this===MLEventType.Rejected;}
}
export class MLResult {
 private constructor(readonly label:string){}
 static readonly Applied=new MLResult('Guardado en esta Demo');static readonly AlreadyApplied=new MLResult('Ya aplicado');static readonly Conflict=new MLResult('Conflicto: actualizá, revisá y reconfirmá');static readonly Blocked=new MLResult('Revisá cuenta, mapping y valores');static readonly Denied=new MLResult('Acceso denegado');static readonly Failed=new MLResult('No se pudo guardar. Conservamos la propuesta');
}
export class MLPhase {
 private constructor(readonly label:string){}
 static readonly Editing=new MLPhase('Editar propuesta');static readonly Reviewing=new MLPhase('Revisar simulación local');static readonly Applied=new MLPhase('Simulación guardada');static readonly AlreadyApplied=new MLPhase('Simulación ya aplicada');static readonly Conflict=new MLPhase('Los datos cambiaron. Actualizá y revisá');static readonly Failed=new MLPhase('No se pudo guardar. Conservamos la propuesta');static readonly Blocked=new MLPhase('Simulación bloqueada: revisá acceso, writer, cuenta y mapping');
}
export class MLTab {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Account=new MLTab('account','Cuenta');static readonly Listings=new MLTab('listings','Publicaciones');static readonly Sync=new MLTab('sync','Sincronización');static readonly Activity=new MLTab('activity','Actividad');static readonly Competition=new MLTab('competition','Competencia');static readonly Unknown=new MLTab('unknown','Pestaña desconocida');static readonly all=[this.Account,this.Listings,this.Sync,this.Activity,this.Competition];static fromWire(raw:unknown){return this.all.find(v=>v.wire===raw)??this.Unknown;}
}
export class MLAction {
 private constructor(readonly label:string){}
 static readonly Connect=new MLAction('Conectar cuenta simulada');static readonly Disconnect=new MLAction('Desconectar cuenta simulada');static readonly Mapping=new MLAction('Completar mapping simulado');static readonly Intent=new MLAction('Crear intención');static readonly Retry=new MLAction('Reintentar');static readonly Send=new MLAction('Simular envío');static readonly Outcome=new MLAction('Simular resultado');
 static readonly Unknown=new MLAction('Acción desconocida');static readonly all=[this.Connect,this.Disconnect,this.Mapping,this.Intent,this.Retry,this.Send,this.Outcome];static fromWire(raw:unknown){return this.all.find(a=>a.label===raw)??this.Unknown;}
 get targetsMapping(){return ![MLAction.Connect,MLAction.Disconnect,MLAction.Unknown].includes(this);}
 get impact(){return this===MLAction.Disconnect?'Desconecta esta cuenta simulada y supera los intentos anteriores; conserva los observados históricos.':this===MLAction.Send?'Registra sólo el envío simulado. El observado permanece sin cambios.':this===MLAction.Retry?'Crea un intento nuevo del resultado rechazado. El observado permanece sin cambios.':this===MLAction.Mapping?'Reemplaza el destino simulado y supera los intentos de la generación anterior.':'La simulación no modifica inventario, pedidos, catálogo ni precios históricos.';}
}
export class MLIntentBlock {
 private constructor(readonly label:string,readonly permitted=false){}
 static readonly None=new MLIntentBlock('',true);static readonly UnknownType=new MLIntentBlock('Tipo desconocido: no se pueden simular resultados.');static readonly UnknownHistory=new MLIntentBlock('Historial desconocido: no se pueden simular resultados.');static readonly UnknownAccount=new MLIntentBlock('Cuenta desconocida: revisá el contexto antes de simular.');static readonly UnknownMapping=new MLIntentBlock('Mapping desconocido: revisá el contexto antes de simular.');static readonly Terminal=new MLIntentBlock('El intento está finalizado; consultá su historial.');
}
export class MLLegacyLink {
 private constructor(readonly label:string){}
 static readonly Linked=new MLLegacyLink('Vínculo local heredado · no acredita mapping externo');static readonly Missing=new MLLegacyLink('Sin asociación heredada');static readonly Unknown=new MLLegacyLink('Vínculo heredado desconocido · no evaluable');static fromWire(raw:unknown){return raw===true?this.Linked:raw===false?this.Missing:this.Unknown;}
}
export class MLLegacyStock {
 private constructor(readonly quantity:number|null,readonly label:string){}
 static readonly Missing=new MLLegacyStock(null,'No disponible');static readonly Unknown=new MLLegacyStock(null,'Observado desconocido · no evaluable');
 static fromWire(raw:unknown){return raw===undefined?this.Missing:Number.isSafeInteger(raw)&&Number(raw)>=0?new MLLegacyStock(Number(raw),String(raw)):this.Unknown;}
}
export const wire=(raw:unknown):unknown=>raw&&typeof raw==='object'&&'wire'in raw?raw.wire:raw;
export interface MLMapping {sku:string;state:MLMappingState;generation:number;account:string;listing:string;variation:string;}
export interface MLIntent {id:string;payload:string;sku:string;mappingGeneration:number;accountGeneration:number;destination:string;type:MLIntentType;value:number|MLPublication;attempts:MLAttempt[];observed?:number|MLPublication;}
export interface MLAttempt {id:string;events:MLEvent[];}
export interface MLEvent {id:string;type:MLEventType;actor:string;date:string;}
export interface MLLedger {account:{state:MLAccountState;generation:number;identity:string};mappings:MLMapping[];intents:MLIntent[];commands:{id:string;payload:string}[];}
