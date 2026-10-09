import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoApplicationState } from './demo-state';
import { DemoContext, DemoOrder } from './demo-model';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoReturnReason, DemoReturnStatus, DemoReturnDisposition, DemoReturnPolicy, DemoReturnRequest } from './demo-postsale';

@Component({ selector: 'sc-demo-postsale', imports: [FormsModule, RouterLink], templateUrl: './demo-postsale.html', styles: [`:host{display:block;margin:1.25rem 0} section,article{border:1px solid #d8e0e8;border-radius:16px;padding:1.25rem;margin:1rem 0;background:#fff} h2,h3{margin-top:0}label{display:block;margin:.7rem 0;font-weight:600}input,select,textarea{display:block;width:100%;box-sizing:border-box;min-height:44px;padding:.7rem;border:1px solid #697684;border-radius:8px;font:inherit}button,a{min-height:44px;display:inline-flex;align-items:center;padding:.65rem 1rem;border-radius:8px;border:1px solid #426273;background:#edf6f8;color:#143748;font:inherit;font-weight:600;margin:.3rem .5rem .3rem 0;cursor:pointer}button:disabled{opacity:.6;cursor:not-allowed}.primary{background:#123f53;color:#fff}.row{display:grid;grid-template-columns:minmax(0,2fr) minmax(120px,1fr);gap:1rem}.muted{color:#4a5c68}.alert{background:#eef7fb;padding:.8rem;border-radius:8px}.amount{font-size:1.15rem;font-weight:700}:focus-visible{outline:3px solid #a85204;outline-offset:3px}@media(max-width:600px){.row{grid-template-columns:1fr}section,article{padding:1rem}button{width:100%;justify-content:center;box-sizing:border-box}}`] })
export class DemoPostSaleComponent {
  @Input() order?: DemoOrder;
  @Input() queue = false;
  readonly state = inject(DemoApplicationState);
  readonly Status = DemoReturnStatus;
  readonly Reason = DemoReturnReason;
  readonly Disposition = DemoReturnDisposition;
  readonly policy = new DemoReturnPolicy();
  quantities: Record<string, number> = {};
  reasons: Record<string, DemoReturnReason> = {};
  notes: Record<string, string> = {};
  outcomes: Record<string, DemoReturnDisposition> = {};
  command = crypto.randomUUID();
  get admin(): boolean { return this.state.context() === DemoContext.Admin; }
  get canRequest(): boolean { return !!this.order && this.state.context() === DemoContext.Customer && this.order.actor === this.state.actorId() && this.order.payment === PaymentStatus.Approved && this.order.shipment === ShipmentStatus.Delivered && this.order.lines.some(line => this.policy.available(this.order!, line.variantId!) > 0) && !(this.order.returns ?? []).some(value => value.status === DemoReturnStatus.Legacy || value.status === DemoReturnStatus.Unknown); }
  get queueRows() { return this.state.data.orders.flatMap(order => (order.returns ?? []).map(request => ({ order, request }))).filter(value => this.admin || value.order.actor === this.state.actorId()); }
  get proposedRefund(): number { return this.order?.lines.reduce((sum, line) => sum + (Number.isInteger(this.quantities[line.variantId!]) && this.quantities[line.variantId!] > 0 && this.quantities[line.variantId!] <= this.policy.available(this.order!, line.variantId!) ? line.unit * this.quantities[line.variantId!] : 0), 0) ?? 0; }
  get alerts() { return (this.state.data.postSaleAlerts ?? []).filter(value => this.admin || value.actor === this.state.actorId()).filter(value => !this.order || value.orderId === this.order.id).slice(-5).reverse(); }
  money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value / 100); }
  selectReason(id: string, raw: unknown): void { this.reasons[id] = DemoReturnReason.fromWire(raw); }
  selectOutcome(request: DemoReturnRequest, id: string, raw: unknown): void { this.outcomes[`${request.id}-${id}`] = DemoReturnDisposition.fromWire(raw); }
  submit(): void {
    if (!this.canRequest || !this.order) { this.state.error.set('La solicitud no está disponible para esta identidad.'); return; }
    const lines = this.order.lines.filter(line => (this.quantities[line.variantId!] ?? 0) !== 0).map(line => ({ variantId: line.variantId!, quantity: this.quantities[line.variantId!], reason: this.reasons[line.variantId!] ?? DemoReturnReason.Unknown }));
    if (this.state.run(() => this.state.commerce.requestReturn(this.state.actorId(), this.order!.id, this.command, lines), 'Solicitud enviada. El comercio revisará los productos y el importe.')) { this.quantities = {}; this.reasons = {}; this.command = crypto.randomUUID(); }
  }
  decide(request: DemoReturnRequest, approve: boolean): void { if (!this.admin || !this.order) return; this.state.run(() => this.state.commerce.decideReturn(this.order!.id, request.id, approve, this.notes[request.id] ?? ''), approve ? 'Solicitud aprobada. Esperamos los productos.' : 'Solicitud rechazada; el comprador ve el motivo.'); }
  inspect(request: DemoReturnRequest): void { if (!this.admin || !this.order) return; this.state.run(() => this.state.commerce.inspectReturn(this.order!.id, request.id, request.lines.map(line => ({ variantId: line.variantId, disposition: this.outcomes[`${request.id}-${line.variantId}`] ?? DemoReturnDisposition.Unknown }))), 'Inspección guardada. Sólo las unidades aptas se repusieron.'); }
  refund(request: DemoReturnRequest): void { if (!this.admin || !this.order) return; this.state.run(() => this.state.commerce.refundReturn(this.order!.id, request.id), 'Reembolso simulado completado. No se movió dinero real.'); }
}
