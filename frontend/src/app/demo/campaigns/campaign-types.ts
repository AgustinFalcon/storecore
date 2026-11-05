export class CampaignActivation {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Enabled=new CampaignActivation('enabled','Habilitada');
 static readonly Paused=new CampaignActivation('paused','Pausada');
 static readonly Unknown=new CampaignActivation('unknown','Estado desconocido');
 static readonly all=[this.Enabled,this.Paused];
 static fromWire(raw:unknown):CampaignActivation{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignApproval {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Draft=new CampaignApproval('draft','Sin aprobación');
 static readonly Approved=new CampaignApproval('approved','Aprobación simulada');
 static readonly Unknown=new CampaignApproval('unknown','Estado desconocido');
 static readonly all=[this.Draft,this.Approved];
 static fromWire(raw:unknown):CampaignApproval{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignTemporalValidity {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Valid=new CampaignTemporalValidity('valid','Intervalo válido');
 static readonly Invalid=new CampaignTemporalValidity('invalid','Intervalo inválido');
 static readonly Unknown=new CampaignTemporalValidity('unknown','Estado desconocido');
 static readonly all=[this.Valid,this.Invalid];
 static fromWire(raw:unknown):CampaignTemporalValidity{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignLifecycle {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Current=new CampaignLifecycle('current','Vigencia actual');
 static readonly Scheduled=new CampaignLifecycle('scheduled','Vigencia futura');
 static readonly Paused=new CampaignLifecycle('paused','En pausa');
 static readonly Expired=new CampaignLifecycle('expired','Vigencia vencida');
 static readonly Unknown=new CampaignLifecycle('unknown','Vigencia no disponible');
 static readonly all=[this.Current,this.Scheduled,this.Paused,this.Expired];
 static fromWire(raw:unknown):CampaignLifecycle{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignRevisionStatus {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Candidate=new CampaignRevisionStatus('candidate','Borrador candidato');
 static readonly Current=new CampaignRevisionStatus('current','Revisión vigente');
 static readonly Superseded=new CampaignRevisionStatus('superseded','Reemplazada');
 static readonly Stale=new CampaignRevisionStatus('stale','Borrador desactualizado');
 static readonly Unknown=new CampaignRevisionStatus('unknown','Estado de revisión desconocido');
 static readonly all=[this.Candidate,this.Current,this.Superseded,this.Stale];
 static fromWire(raw:unknown):CampaignRevisionStatus{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignCommand {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly SaveDraft=new CampaignCommand('save-draft','Guardar borrador');
 static readonly Approve=new CampaignCommand('approve','Aprobar revisión');
 static readonly Pause=new CampaignCommand('pause','Pausar');
 static readonly Resume=new CampaignCommand('resume','Reanudar');
 static readonly Unknown=new CampaignCommand('unknown','Estado desconocido');
 static readonly all=[this.SaveDraft,this.Approve,this.Pause,this.Resume];
 static fromWire(raw:unknown):CampaignCommand{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignPhase {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Editing=new CampaignPhase('editing','Editar campaña');
 static readonly Preview=new CampaignPhase('preview','Vista previa');
 static readonly Confirming=new CampaignPhase('confirming','Confirmar cambio');
 static readonly Saving=new CampaignPhase('saving','Guardando');
 static readonly Succeeded=new CampaignPhase('succeeded','Guardado');
 static readonly Failure=new CampaignPhase('failure','Error al guardar');
 static readonly Conflict=new CampaignPhase('conflict','Conflicto');
 static readonly Unknown=new CampaignPhase('unknown','Estado desconocido');
 static readonly all=[this.Editing,this.Preview,this.Confirming,this.Saving,this.Succeeded,this.Failure,this.Conflict];
 static fromWire(raw:unknown):CampaignPhase{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignCurrency {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly ARS=new CampaignCurrency('ARS','ARS');
 static readonly Unknown=new CampaignCurrency('unknown','Estado desconocido');
 static readonly all=[this.ARS];
 static fromWire(raw:unknown):CampaignCurrency{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignIssue {
 private constructor(readonly wire:string,readonly label:string){}
 get field():string{return this===CampaignIssue.Title?'campaign-title':this===CampaignIssue.Priority?'campaign-priority':this===CampaignIssue.Margin?'campaign-margin':this===CampaignIssue.Interval?'campaign-start':this===CampaignIssue.Scope?'campaign-scope':'campaign-error';}
 static readonly None=new CampaignIssue('none','Sin errores');
 static readonly Authority=new CampaignIssue('authority','No tenés autorización vigente.');
 static readonly Shape=new CampaignIssue('shape','El registro no es válido.');
 static readonly Scope=new CampaignIssue('scope','Seleccioná entre 1 y 20 SKU únicos y conocidos.');
 static readonly Title=new CampaignIssue('title','Ingresá un título de hasta 120 caracteres.');
 static readonly Interval=new CampaignIssue('interval','Indicá un intervalo válido en Buenos Aires.');
 static readonly Margin=new CampaignIssue('margin','Indicá margen declarado entre 0 y 10000 bps; no es rentabilidad verificada.');
 static readonly Priority=new CampaignIssue('priority','Indicá prioridad entera entre 0 y 100000.');
 static readonly Expired=new CampaignIssue('expired','La vigencia terminó; creá una revisión de ventana.');
 static readonly Conflict=new CampaignIssue('conflict','Los datos cambiaron. Volvé a previsualizar.');
 static readonly PersistenceFailure=new CampaignIssue('persistence-failure','No se pudo verificar el guardado. Volvé a previsualizar.');
 static readonly Unknown=new CampaignIssue('unknown','Estado desconocido');
 static readonly all=[this.None,this.Authority,this.Shape,this.Scope,this.Title,this.Interval,this.Margin,this.Priority,this.Expired,this.Conflict,this.PersistenceFailure];
 static fromWire(raw:unknown):CampaignIssue{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignError extends Error {constructor(readonly issue:CampaignIssue){super(issue.label);}}

export class CampaignPurchaseEligibility {
 private constructor(readonly wire:string,readonly label:string,readonly purchasable:boolean){}
 static readonly Available=new CampaignPurchaseEligibility('available','Comprable con cotización SC18',true);
 static readonly OutOfStock=new CampaignPurchaseEligibility('out-of-stock','No comprable: sin stock vendible',false);
 static readonly NotQuotable=new CampaignPurchaseEligibility('not-quotable','No comprable: cotización SC18 no disponible',false);
 static readonly Unknown=new CampaignPurchaseEligibility('unknown','Disponibilidad no reconocida',false);
 static readonly all=[this.Available,this.OutOfStock,this.NotQuotable];
 static fromWire(raw:unknown):CampaignPurchaseEligibility{return this.all.find(value=>value.wire===raw)??this.Unknown;}
 static project(available:number,unit:number|null):CampaignPurchaseEligibility{if(!Number.isSafeInteger(available)||available<0)return this.Unknown;if(unit===null||!Number.isSafeInteger(unit)||unit<=0)return this.NotQuotable;return available>0?this.Available:this.OutOfStock;}
}
