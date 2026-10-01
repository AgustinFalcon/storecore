/**
 * Closed RMA states and the one-step transitions the console may send.
 */
export class RmaTransition {
  private constructor(
    readonly wire: string,
    readonly label: string,
  ) {}

  static readonly Received = new RmaTransition('RECEIVED', 'RMA recibido');
  static readonly Inspected = new RmaTransition('INSPECTED', 'Inspeccionar');
  static readonly Adjusted = new RmaTransition('ADJUSTED', 'Ajustar stock');
  static readonly Unknown = new RmaTransition('', 'Transición de RMA no reconocida');

  static fromWire(raw: string | null | undefined): RmaTransition {
    const wire = raw?.trim() ?? '';
    return BY_WIRE.get(wire) ?? RmaTransition.Unknown;
  }
}

const TRANSITIONS: readonly RmaTransition[] = [
  RmaTransition.Received,
  RmaTransition.Inspected,
  RmaTransition.Adjusted,
];

const BY_WIRE = new Map(TRANSITIONS.map((status) => [status.wire, status]));

export class RmaStatus {
  private constructor(
    readonly wire: string,
    readonly label: string,
    private readonly nextTransition: RmaTransition | null,
  ) {}

  static readonly Requested = new RmaStatus('REQUESTED', 'Solicitado', RmaTransition.Received);
  static readonly Approved = new RmaStatus('APPROVED', 'Aprobado', RmaTransition.Received);
  static readonly ReturnReceived = new RmaStatus('RETURN_RECEIVED', 'Recibido', RmaTransition.Inspected);
  static readonly Inspected = new RmaStatus('INSPECTED', 'Inspeccionado', RmaTransition.Adjusted);
  static readonly Rejected = new RmaStatus('REJECTED', 'Rechazado', RmaTransition.Received);
  static readonly Closed = new RmaStatus('CLOSED', 'Cerrado', null);
  static readonly Unknown = new RmaStatus('', 'Estado de RMA no reconocido', RmaTransition.Received);

  static fromWire(raw: string | null | undefined): RmaStatus {
    const wire = raw?.trim() ?? '';
    if (!wire) {
      return RmaStatus.Unknown;
    }
    return BY_STATUS.get(wire) ?? RmaStatus.Unknown;
  }

  static fromOptionalWire(raw: string | null | undefined): RmaStatus | null {
    const wire = raw?.trim() ?? '';
    if (!wire) {
      return null;
    }
    return RmaStatus.fromWire(wire);
  }

  get next(): RmaTransition | null {
    return this.nextTransition;
  }
}

const STATUSES: readonly RmaStatus[] = [
  RmaStatus.Requested,
  RmaStatus.Approved,
  RmaStatus.ReturnReceived,
  RmaStatus.Inspected,
  RmaStatus.Rejected,
  RmaStatus.Closed,
];

const BY_STATUS = new Map(STATUSES.map((status) => [status.wire, status]));
