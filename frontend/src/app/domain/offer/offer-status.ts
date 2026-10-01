/**
 * Closed storefront offer statuses. Console write is only draft or active.
 */
export class OfferStatus {
  private constructor(
    readonly wire: string,
    readonly label: string,
    readonly writable: boolean,
  ) {}

  static readonly Draft = new OfferStatus('DRAFT', 'Borrador', true);
  static readonly Active = new OfferStatus('ACTIVE', 'Activa', true);
  static readonly Paused = new OfferStatus('PAUSED', 'Pausada', false);
  static readonly Ended = new OfferStatus('ENDED', 'Finalizada', false);
  static readonly Unknown = new OfferStatus('', 'Estado de oferta no reconocido', false);

  static fromWire(raw: string | null | undefined): OfferStatus {
    const wire = raw?.trim() ?? '';
    if (!wire) {
      return OfferStatus.Unknown;
    }
    return BY_WIRE.get(wire) ?? OfferStatus.Unknown;
  }

  static writableOptions(): readonly OfferStatus[] {
    return WRITABLE;
  }
}

const KNOWN: readonly OfferStatus[] = [
  OfferStatus.Draft,
  OfferStatus.Active,
  OfferStatus.Paused,
  OfferStatus.Ended,
];

const WRITABLE = KNOWN.filter((status) => status.writable);

const BY_WIRE = new Map(KNOWN.map((status) => [status.wire, status]));
