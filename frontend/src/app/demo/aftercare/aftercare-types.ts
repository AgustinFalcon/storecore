export class ReturnStage {
  private constructor(readonly wire:string,readonly label:string) {}
  static readonly Submitted=new ReturnStage('submitted','Solicitud enviada');
  static readonly Review=new ReturnStage('review','En revisión');
  static readonly Approved=new ReturnStage('approved','Devolución aprobada');
  static readonly Rejected=new ReturnStage('rejected','Solicitud rechazada');
  static readonly Received=new ReturnStage('received','Productos recibidos');
  static readonly RefundPending=new ReturnStage('refund-pending','Reintegro pendiente');
  static readonly Refunded=new ReturnStage('refunded','Reintegro simulado registrado');
  static readonly Cancelled=new ReturnStage('cancelled','Solicitud cancelada');
  static readonly Closed=new ReturnStage('closed','Solicitud cerrada');
  static readonly Unknown=new ReturnStage('','Estado de devolución desconocido');
  static readonly all=[this.Submitted,this.Review,this.Approved,this.Rejected,this.Received,this.RefundPending,this.Refunded,this.Cancelled,this.Closed];
  static fromWire(raw:unknown):ReturnStage {return this.all.find(value=>value.wire===raw)??this.Unknown;}
  get canCancel():boolean{return this===ReturnStage.Submitted;}
  get terminal():boolean{return [ReturnStage.Rejected,ReturnStage.Cancelled,ReturnStage.Closed].includes(this);}
  preservesClosure(outcome:ReturnOutcome):boolean{return this===ReturnStage.Rejected?outcome===ReturnOutcome.Rejected:this===ReturnStage.Cancelled?outcome===ReturnOutcome.Cancelled:this===ReturnStage.Refunded&&outcome===ReturnOutcome.Accepted;}
  permitsNext(next:ReturnStage):boolean {const transitions=new Map<ReturnStage,readonly ReturnStage[]>([[ReturnStage.Submitted,[ReturnStage.Review,ReturnStage.Cancelled]],[ReturnStage.Review,[ReturnStage.Approved,ReturnStage.Rejected]],[ReturnStage.Approved,[ReturnStage.Received]],[ReturnStage.Received,[ReturnStage.RefundPending]],[ReturnStage.RefundPending,[ReturnStage.Refunded]],[ReturnStage.Refunded,[ReturnStage.Closed]],[ReturnStage.Rejected,[ReturnStage.Closed]],[ReturnStage.Cancelled,[ReturnStage.Closed]]]);return transitions.get(this)?.includes(next)??false;}
}
export class ReturnOutcome {
  private constructor(readonly wire:string,readonly label:string,readonly consumes:boolean){}
  static readonly Pending=new ReturnOutcome('pending','Sin decisión',true);
  static readonly Accepted=new ReturnOutcome('accepted','Aceptada',true);
  static readonly Rejected=new ReturnOutcome('rejected','Rechazada',false);
  static readonly Cancelled=new ReturnOutcome('cancelled','Cancelada por el cliente',false);
  static readonly Unknown=new ReturnOutcome('','Resultado desconocido',true);
  static readonly all=[this.Pending,this.Accepted,this.Rejected,this.Cancelled];
  static fromWire(raw:unknown):ReturnOutcome{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class RefundStatus {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly None=new RefundStatus('none','Sin reintegro registrado');
  static readonly Pending=new RefundStatus('pending','Reintegro pendiente');
  static readonly PartiallyRefunded=new RefundStatus('partial','Reintegro parcial simulado');
  static readonly Refunded=new RefundStatus('refunded','Reintegro de productos simulado');
  static readonly Unknown=new RefundStatus('','Reintegro desconocido');
  static readonly all=[this.None,this.Pending,this.PartiallyRefunded,this.Refunded];
  static fromWire(raw:unknown):RefundStatus{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class ReturnReason {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Damaged=new ReturnReason('damaged','El producto llegó dañado');
  static readonly Different=new ReturnReason('different','Recibí un producto diferente');
  static readonly ChangedMind=new ReturnReason('changed-mind','Quiero devolver el producto');
  static readonly Unknown=new ReturnReason('','Elegí un motivo');
  static readonly all=[this.Damaged,this.Different,this.ChangedMind];
  static fromWire(raw:unknown):ReturnReason{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class IncidentReason {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Delivery=new IncidentReason('delivery','Consulta sobre la entrega');
  static readonly Product=new IncidentReason('product','Consulta sobre un producto');
  static readonly Unknown=new IncidentReason('','Elegí el tipo de consulta');
  static readonly all=[this.Delivery,this.Product];
  static fromWire(raw:unknown):IncidentReason{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class IncidentStatus {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Submitted=new IncidentStatus('submitted','Consulta registrada');
  static readonly Closed=new IncidentStatus('closed','Consulta cerrada');
  static readonly Unknown=new IncidentStatus('','Estado de consulta desconocido');
  static readonly all=[this.Submitted,this.Closed];
  static fromWire(raw:unknown):IncidentStatus{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class AftercareIssue {
  private constructor(readonly label:string){}
  static readonly None=new AftercareIssue('');
  static readonly Authority=new AftercareIssue('El acceso a este pedido no está disponible.');
  static readonly Ineligible=new AftercareIssue('Este pedido todavía no admite una solicitud de devolución.');
  static readonly Legacy=new AftercareIssue('Hay un antecedente de devolución sin cantidades verificables. La posventa requiere revisión.');
  static readonly Unknown=new AftercareIssue('Hay datos de posventa no reconocidos. No habilitamos cambios.');
  static readonly Active=new AftercareIssue('Ya hay una solicitud activa para este pedido.');
  static readonly Exhausted=new AftercareIssue('Todas las unidades de este pedido ya están incluidas en devoluciones aceptadas. No hay cantidades disponibles para otra solicitud.');
  static readonly Quantity=new AftercareIssue('Elegí al menos un producto y cantidades enteras dentro del saldo disponible.');
  static readonly Reason=new AftercareIssue('Elegí un motivo válido.');
  static readonly IncidentMessage=new AftercareIssue('Contanos qué ocurrió en entre 3 y 1000 caracteres.');
  static readonly Conflict=new AftercareIssue('Los datos cambiaron. Revisá la solicitud antes de continuar.');
}
export class AftercareDialog {
  private constructor(readonly label:string){}
  static readonly None=new AftercareDialog('');static readonly Return=new AftercareDialog('Solicitar devolución');static readonly Cancel=new AftercareDialog('Cancelar solicitud');static readonly Incident=new AftercareDialog('Informar incidencia de entrega');static readonly Receipt=new AftercareDialog('Comprobante de demostración');static readonly Tracking=new AftercareDialog('Seguimiento simulado');static readonly PaymentCancel=new AftercareDialog('Cancelar pago simulado');
}
export class AftercareFormStep {
  private constructor(readonly label:string){}
  static readonly Edit=new AftercareFormStep('Seleccionar productos');static readonly Confirm=new AftercareFormStep('Revisar solicitud');static readonly Failure=new AftercareFormStep('No se pudo guardar');
}
export class AftercareSuccessTarget {
  private constructor(readonly id:string){}
  static readonly Return=new AftercareSuccessTarget('aftercare-status-heading');
  static readonly Incident=new AftercareSuccessTarget('aftercare-inquiries-heading');
}
