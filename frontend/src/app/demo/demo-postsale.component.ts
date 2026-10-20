import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoApplicationState } from './demo-state';
import { DemoContext, DemoOrder } from './demo-model';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoReturnPolicy } from './postsale/return-policy';
import { DemoCustomerOrderFilter } from './demo-customer-order-filter';
import { DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnQueueFilter, DemoReturnReason, DemoReturnRequest, DemoReturnStatus, demoReturnLineKey } from './postsale/postsale-types';

@Component({ selector: 'sc-demo-postsale', imports: [FormsModule, RouterLink], templateUrl: './demo-postsale.html', styleUrl: './demo.scss' })
export class DemoPostSaleComponent {
  @Input() order?: DemoOrder;
  @Input() queue = false;
  @Input() customerFilter = DemoCustomerOrderFilter.All;
  readonly state = inject(DemoApplicationState);
  readonly Status = DemoReturnStatus;
  readonly Reason = DemoReturnReason;
  readonly Disposition = DemoReturnDisposition;
  readonly Inspection = DemoReturnInspectionResult;
  readonly Filter = DemoReturnQueueFilter;
  readonly policy = new DemoReturnPolicy();
  readonly key = demoReturnLineKey;
  filter = DemoReturnQueueFilter.All;
  quantities: Record<string, number> = {};
  reasons: Record<string, DemoReturnReason> = {};
  notes: Record<string, string> = {};
  results: Record<string, DemoReturnInspectionResult> = {};
  outcomes: Record<string, DemoReturnDisposition> = {};
  private command = crypto.randomUUID();
  get admin(): boolean { return this.state.context() === DemoContext.Admin; }
  get requests(): DemoReturnRequest[] { return this.state.data.returns.filter(request => (this.admin || request.actorId === this.state.actorId()) && this.customerFilter.matches({actor:request.actorId}) && (!this.order || request.orderId === this.order.id) && this.filter.matches(request.status)); }
  get canRequest(): boolean { return !!this.order && this.state.context() === DemoContext.Customer && this.order.actor === this.state.actorId() && this.order.payment === PaymentStatus.Approved && this.order.shipment === ShipmentStatus.Delivered && this.order.lines.some(line => this.available(line)>0) && !this.state.data.returns.some(request => request.orderId===this.order!.id && request.status===DemoReturnStatus.Unknown); }
  available(line: {sku: string; variantId: string}): number { return this.order ? this.policy.available(this.order, this.state.data.returns, line.sku, line.variantId) : 0; }
  purchasedLine(request: DemoReturnRequest, line: {sku: string; variantId: string}) {
    return this.state.data.orders.find(order => order.id === request.orderId)?.lines.find(purchased => this.key(purchased) === this.key(line));
  }
  get proposedRefund(): number { return this.order?.lines.reduce((sum, line) => { const quantity=this.quantities[this.key(line)]??0; return sum+(Number.isInteger(quantity)&&quantity>0&&quantity<=this.available(line)?line.unit*quantity:0); },0)??0; }
  get alerts() { return this.state.data.postSaleAlerts.filter(value => (this.admin || value.actorId===this.state.actorId()) && this.customerFilter.matches({actor:value.actorId})).filter(value => !this.order || value.orderId===this.order.id).slice(-5).reverse(); }
  money(value: number): string { return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(value/100); }
  selectFilter(raw: unknown): void { this.filter=DemoReturnQueueFilter.fromWire(raw); }
  selectReason(id: string, raw: unknown): void { this.reasons[id]=DemoReturnReason.fromWire(raw); }
  selectResult(id: string, raw: unknown): void { this.results[id]=DemoReturnInspectionResult.fromWire(raw); }
  selectOutcome(request: DemoReturnRequest, line: {sku:string;variantId:string}, raw: unknown): void { this.outcomes[request.id+this.key(line)]=DemoReturnDisposition.fromWire(raw); }
  submit(): void {
    if(!this.canRequest||!this.order){this.state.error.set('La solicitud no está disponible para esta identidad.');return;}
    const selections=this.order.lines.filter(line=>(this.quantities[this.key(line)]??0)!==0).map(line=>({sku:line.sku,variantId:line.variantId,quantity:this.quantities[this.key(line)],reason:this.reasons[this.key(line)]??DemoReturnReason.Unknown}));
    if(this.state.run(()=>this.state.commerce.postSale.request(this.state.actorId(),this.command,this.order!.id,selections),'Solicitud enviada. El comercio revisará los productos y el importe.')){this.quantities={};this.reasons={};this.command=crypto.randomUUID();}
  }
  cancel(request: DemoReturnRequest): void { this.state.run(()=>this.state.commerce.postSale.cancel(this.state.actorId(),request.id),'Solicitud cancelada.'); }
  decide(request: DemoReturnRequest, approve: boolean): void { this.state.run(()=>this.state.commerce.postSale.decide(this.state.actorId(),request.id,approve,this.notes[request.id]??''),'Decisión de postventa registrada.'); }
  receive(request: DemoReturnRequest): void { this.state.run(()=>this.state.commerce.postSale.receive(this.state.actorId(),request.id),'Devolución recibida.'); }
  inspect(request: DemoReturnRequest): void { this.state.run(()=>this.state.commerce.postSale.inspect(this.state.actorId(),request.id,this.notes[request.id]??'',this.results[request.id]??DemoReturnInspectionResult.Unknown),'Inspección registrada.'); }
  dispose(request: DemoReturnRequest): void { this.state.run(()=>this.state.commerce.postSale.dispose(this.state.actorId(),request.id,request.lines.map(line=>({sku:line.sku,variantId:line.variantId,disposition:this.outcomes[request.id+this.key(line)]??DemoReturnDisposition.Unknown}))),'Disposición registrada; inventario actualizado.'); }
  refund(request: DemoReturnRequest): void { this.state.run(()=>this.state.commerce.postSale.refund(this.state.actorId(),request.id),'Reembolso simulado completado.'); }
}
