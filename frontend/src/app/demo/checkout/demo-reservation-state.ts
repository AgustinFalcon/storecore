export class DemoReservationState {
  private constructor(readonly wire: string, readonly pendingGuidance: string, readonly cancelLabel: string, readonly cancelConfirmation: string, readonly cancelSuccess: string, readonly canCancelPending: boolean, readonly canResolvePending: boolean) {}
  static readonly None = new DemoReservationState('NONE', 'El pago está pendiente. Podés cancelarlo.', 'Cancelar pago', '¿Cancelar este pago pendiente?', 'Pago cancelado.', true, false);
  static readonly Held = new DemoReservationState('HELD', 'Reserva de stock vigente para este pedido. Elegí aprobado o rechazado en el selector de escenario para resolver el pago.', 'Cancelar pago y liberar mi reserva', 'Cancelar el pago libera únicamente la reserva de este pedido sin descontar existencias.', 'Pago cancelado. Reserva propia liberada.', true, true);
  static readonly Released = new DemoReservationState('RELEASED', 'Este pago requiere revisión antes de continuar.', 'Cancelar pago', '', 'Pago cancelado. Reserva propia liberada.', false, false);
  static readonly Consumed = new DemoReservationState('CONSUMED', 'Este pago requiere revisión antes de continuar.', 'Cancelar pago', '', 'Pago no modificado.', false, false);
  static readonly Unknown = new DemoReservationState('', 'No hay evidencia suficiente para cancelar este pago. Revisá los datos de demostración.', 'Cancelar pago', '', 'Pago no modificado.', false, false);
  static readonly all = [this.None, this.Held, this.Released, this.Consumed];
  static fromWire(raw: unknown): DemoReservationState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
