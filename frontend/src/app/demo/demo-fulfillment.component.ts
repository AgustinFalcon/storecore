import { Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentStatus } from '../domain/order/payment-status';
import { DemoApplicationState } from './demo-state';
import { DemoContext, DemoOrder } from './demo-model';
import { DemoDeliveryMethod } from './demo-process-types';
import { DemoFulfillment, DemoFulfillmentAction, DemoFulfillmentPhase, DemoFulfillmentPolicy, DemoIncidentKind, ensureFulfillment } from './demo-fulfillment';

@Component({ selector: 'sc-demo-fulfillment', imports: [FormsModule], template: `
@if (visible && order; as current) {
 <section aria-label="Gestión de entrega" class="delivery-card">
  <p class="eyebrow">{{ pickup ? 'RETIRO EN COMERCIO' : 'ENVÍO A DOMICILIO' }} · SIMULACIÓN</p><h2>{{ value.phase.label }}</h2>
  @if (pickup) { <dl><dt>Sucursal</dt><dd>{{ value.store }}</dd><dt>Dirección de retiro</dt><dd>{{ value.location }}</dd><dt>Horarios</dt><dd>{{ value.hours }}</dd><dt>Plazo de retiro</dt><dd>{{ value.pickupDeadline }}</dd></dl><p>Retirá con DNI y número de pedido. Cuando esté listo, recibirás una alerta.</p> }
  @else { <dl><dt>Destinatario</dt><dd>{{ value.recipient }} · {{ value.phone }}</dd><dt>Domicilio</dt><dd>{{ current.address }}</dd><dt>Transportista / servicio</dt><dd>{{ value.carrier }} · {{ value.service }}</dd><dt>Seguimiento</dt><dd>{{ current.tracking || 'Disponible al despachar' }}</dd><dt>Intentos de entrega</dt><dd>{{ value.attempts }}</dd></dl> }
  @if (value.incident !== Incident.None) { <p class="notice" role="status"><strong>{{ value.incident.label }}</strong> · {{ value.incidentText }}<br/>Responsable: el comercio coordina la resolución con el comprador.</p> }
  @if (value.resolution) { <p class="notice">Última coordinación: {{ value.resolution }}</p> }
  @if (admin && value.phase === Phase.Preparing && canConfigure) {
   <details><summary data-cta="fulfillment-details">Editar datos de {{ pickup ? 'retiro' : 'envío' }}</summary>
    <form (submit)="$event.preventDefault(); save()">
    @if (pickup) { <label>Sucursal<input required name="store" [(ngModel)]="draft.store"/></label><label>Dirección de retiro<input required name="location" [(ngModel)]="draft.location"/></label><label>Horarios de retiro<input required name="hours" [(ngModel)]="draft.hours"/></label><label>Último día para retirar<input required type="date" name="deadline" [(ngModel)]="draft.pickupDeadline"/></label> }
    @else { <label>Nombre del destinatario<input required name="recipient" [(ngModel)]="draft.recipient"/></label><label>Teléfono de contacto<input required name="phone" [(ngModel)]="draft.phone"/></label><label>Transportista simulado<input required name="carrier" [(ngModel)]="draft.carrier"/></label><label>Servicio de envío<input required name="service" [(ngModel)]="draft.service"/></label> }
    <button data-cta="fulfillment-save" type="submit">Guardar datos</button></form>
   </details>
  }
  @if (admin && actions.length) {
   @if (pickup && value.incident === Incident.Pickup) { <label>Nuevo plazo de retiro<input type="date" data-cta="fulfillment-new-deadline" [(ngModel)]="newDeadline"/></label> }
   <label>Motivo o coordinación del próximo intento<textarea data-cta="fulfillment-note" [(ngModel)]="note" placeholder="Ejemplo: nueva visita coordinada para mañana de 9 a 12 h"></textarea></label>
   <div class="actions">@for (action of actions; track action.wire) { <button [attr.data-cta]="'fulfillment-' + action.wire" (click)="perform(action)">{{ action.label }}</button> }</div>
  } @else if (!value.phase.complete) { <p>{{ admin ? 'Esperamos un pago aprobado o la resolución de la incidencia para avanzar.' : 'Te avisaremos cuando cambie el seguimiento.' }}</p> }
  @if (admin && value.incident === Incident.Report) { <form (submit)="$event.preventDefault(); resolve()"><label>Respuesta al comprador<input #resolutionInput required name="resolution" data-cta="fulfillment-resolution" [(ngModel)]="resolution"/></label><button type="submit" data-cta="fulfillment-resolve">Resolver consulta</button></form> }
 </section>
}`, styles: [`:host{display:block}section{padding:1.25rem;border:1px solid #ccd8df;border-radius:16px;background:#fff;margin:1rem 0;overflow-wrap:anywhere}h2,h3{color:#183c4c}dl{display:grid;grid-template-columns:minmax(100px,1fr) 2fr;gap:.7rem}dt{font-weight:700}dd{margin:0}label{display:block;font-weight:600;margin:1rem 0}input,textarea{display:block;box-sizing:border-box;width:100%;padding:.8rem;border:1px solid #657f8c;border-radius:8px;font:inherit}button,summary{min-height:44px;padding:.7rem 1rem;font:inherit;font-weight:600;cursor:pointer}button{background:#164759;color:#fff;border:0;border-radius:8px;margin:.3rem .5rem .3rem 0}summary{color:#123b4d}.notice{background:#edf5f8;padding:1rem;border-radius:8px}li{margin:.6rem 0}:focus-visible{outline:3px solid #a85204;outline-offset:3px}@media(max-width:600px){dl{grid-template-columns:1fr;gap:.3rem}dd{margin-bottom:.6rem}button{width:100%;margin:.4rem 0}section{padding:1rem}}`] })
export class DemoFulfillmentComponent {
  @ViewChild('resolutionInput') private resolutionInput?: ElementRef<HTMLInputElement>;
  private current?: DemoOrder;
  @Input() set order(value: DemoOrder | undefined) { if (this.current?.id !== value?.id) { this.note = ''; this.resolution = ''; this.newDeadline = ''; } this.current = value; if (value) this.draft = { ...ensureFulfillment(value) }; }
  get order(): DemoOrder | undefined { return this.current; }
  readonly state = inject(DemoApplicationState);
  readonly policy = new DemoFulfillmentPolicy();
  readonly Phase = DemoFulfillmentPhase;
  readonly Incident = DemoIncidentKind;
  draft = {} as DemoFulfillment;
  note = ''; resolution = ''; newDeadline = '';
  get admin(): boolean { return this.state.context() === DemoContext.Admin; }
  get visible(): boolean { return !!this.order && (this.admin || (this.state.context() === DemoContext.Customer && this.order.actor === this.state.actorId())); }
  get pickup(): boolean { return this.order?.delivery?.method === DemoDeliveryMethod.Pickup; }
  get value(): DemoFulfillment { return ensureFulfillment(this.order!); }
  get actions(): DemoFulfillmentAction[] { return this.visible && this.admin && this.order ? this.policy.actions(this.order) : []; }
  get canConfigure(): boolean { return !!this.order && this.order.payment === PaymentStatus.Approved && this.value.phase === DemoFulfillmentPhase.Preparing && this.value.incident !== DemoIncidentKind.Unknown && this.order.delivery?.method !== DemoDeliveryMethod.Unknown; }
  save(): void { if (!this.visible || !this.admin || !this.order) return; this.state.run(() => this.state.commerce.configureFulfillment(this.order!.id, this.draft), 'Datos de entrega guardados.'); }
  perform(action: DemoFulfillmentAction): void { if (!this.visible || !this.admin || !this.order) return; if (this.state.run(() => this.state.commerce.fulfill(this.order!.id, action, this.note, this.newDeadline), action.label + ' · simulación guardada')) { this.note = ''; this.newDeadline = ''; } }
  resolve(): void { if (!this.visible || !this.admin || !this.order) return; if (this.state.run(() => this.state.commerce.resolveIncident(this.order!.id, this.resolution), 'Consulta resuelta y visible para el comprador.')) this.resolution = ''; }
  requestResolution(): void { if (!this.visible || !this.admin || this.value.incident !== DemoIncidentKind.Report) return; this.resolutionInput?.nativeElement.focus(); }
}
