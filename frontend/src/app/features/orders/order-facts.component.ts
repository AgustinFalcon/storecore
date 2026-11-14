import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CustomerOrder } from '../../domain/order/order.entity';

/** Both realms render only the allowlisted, already translated read projection. */
@Component({
  selector: 'sc-order-facts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (order; as value) {
      <section class="sc-panel" aria-label="Datos históricos de la orden">
        <h2>Datos de la orden</h2>
        <dl>
          <dt>Número</dt><dd>{{ value.orderNumber ?? 'No disponible' }}</dd>
          <dt>Creación</dt><dd>{{ value.createdAt ?? 'No disponible' }}</dd>
          <dt>Actualización</dt><dd>{{ value.updatedAt ?? 'No disponible' }}</dd>
          <dt>Moneda</dt><dd>{{ value.currency ?? 'No disponible' }}</dd>
          <dt>Subtotal</dt><dd>{{ value.subtotal ?? 'No disponible' }}</dd>
          <dt>Costo de envío</dt><dd>{{ value.shippingCost ?? 'No disponible' }}</dd>
          <dt>Total</dt><dd>{{ value.total }}</dd>
          <dt>Comprador histórico</dt><dd>{{ value.buyerName.value ?? value.buyerName.state.label }} @if (value.buyerName.reason) { · {{ value.buyerName.reason.label }} }</dd>
          <dt>Email histórico</dt><dd>{{ value.buyerEmail.value ?? value.buyerEmail.state.label }} @if (value.buyerEmail.reason) { · {{ value.buyerEmail.reason.label }} }</dd>
          <dt>Pago verificado</dt><dd>{{ value.payment.value?.label ?? value.payment.state.label }} @if (value.payment.reason) { · {{ value.payment.reason.label }} }</dd>
        </dl>
        <h3>Entrega registrada</h3>
        @if (value.deliveryDecision?.quote?.known) {
          <dl><dt>Modalidad</dt><dd>{{ value.deliveryDecision!.quote.label }}</dd>
          <dt>Destino</dt><dd>{{ value.deliveryDecision!.quote.destination }}</dd>
          <dt>Plazo estimado</dt><dd>{{ value.deliveryDecision!.quote.eta }}</dd>
          @if (value.deliveryDecision!.quote.instructions) { <dt>Instrucciones</dt><dd>{{ value.deliveryDecision!.quote.instructions }}</dd> }
          </dl>
        } @else if (value.deliveryDecision?.state?.permitsLegacy && value.delivery.value; as delivery) {
          <dl>
            <dt>Destinatario</dt><dd>{{ delivery.recipient ?? 'No disponible' }}</dd>
            <dt>Dirección</dt><dd>{{ delivery.street ?? 'No disponible' }}</dd>
            <dt>Ciudad</dt><dd>{{ delivery.city ?? 'No disponible' }}</dd>
            <dt>Provincia</dt><dd>{{ delivery.province ?? 'No disponible' }}</dd>
            <dt>Código postal</dt><dd>{{ delivery.postalCode ?? 'No disponible' }}</dd>
            <dt>País</dt><dd>{{ delivery.country ?? 'No disponible' }}</dd>
          </dl>
        } @else { <p>{{ value.deliveryDecision?.state?.label ?? value.delivery.state.label }}</p> }
        <h3>Devoluciones</h3>
        <p>{{ value.returnEligibility.label }}</p>
        <p>Información de las condiciones registradas. No inicia una devolución ni establece un derecho o plazo.</p>
        <h3>Historial</h3>
        @if (value.timeline.value; as events) {
          <ol>
            @for (event of events; track event.id) { <li>{{ event.kind.label }} · {{ event.occurredAt ?? 'Fecha no disponible' }}</li> }
          </ol>
          @if (!events.length) { <p>Sin eventos registrados.</p> }
        } @else { <p>{{ value.timeline.state.label }} @if (value.timeline.reason) { · {{ value.timeline.reason.label }} }</p> }
      </section>
    }
  `,
})
export class OrderFactsComponent {
  @Input() order: CustomerOrder | null = null;
}
