export class OfferStatus {
  private constructor(readonly wire: string, readonly label: string, readonly canActivate: boolean, readonly canPause: boolean, readonly canEnd: boolean) {}
  static readonly Draft = new OfferStatus('DRAFT', 'Borrador', true, false, true);
  static readonly Active = new OfferStatus('ACTIVE', 'Activa', false, true, true);
  static readonly Paused = new OfferStatus('PAUSED', 'Pausada', true, false, true);
  static readonly Ended = new OfferStatus('ENDED', 'Finalizada', false, false, false);
  static readonly Unknown = new OfferStatus('UNKNOWN', 'Estado no disponible', false, false, false);
  static fromWire(raw: unknown): OfferStatus {
    return [this.Draft, this.Active, this.Paused, this.Ended].find((state) => state.wire === raw) ?? this.Unknown;
  }
}

export class DiscountKind {
  private constructor(readonly wire: string, readonly label: string, readonly suffix: string) {}
  static readonly Percent = new DiscountKind('PERCENT', 'Porcentaje', '%');
  static readonly Fixed = new DiscountKind('FIXED', 'Importe fijo', 'ARS');
  static readonly Unknown = new DiscountKind('UNKNOWN', 'Tipo no disponible', '');
  static fromWire(raw: unknown): DiscountKind {
    return [this.Percent, this.Fixed].find((kind) => kind.wire === raw) ?? this.Unknown;
  }
  static readonly selectable: readonly DiscountKind[] = [DiscountKind.Percent, DiscountKind.Fixed];
}

export class OfferTransition {
  private constructor(readonly wire: string, readonly label: string, private readonly rule: (status: OfferStatus) => boolean) {}
  static readonly Activate = new OfferTransition('ACTIVATE', 'Activar', (status) => status.canActivate);
  static readonly Pause = new OfferTransition('PAUSE', 'Pausar', (status) => status.canPause);
  static readonly End = new OfferTransition('END', 'Finalizar', (status) => status.canEnd);
  static readonly Unknown = new OfferTransition('UNKNOWN', 'Transición no disponible', () => false);
  private static readonly values = [OfferTransition.Activate, OfferTransition.Pause, OfferTransition.End] as const;
  permits(status: OfferStatus): boolean { return this.rule(status); }
  static fromWire(raw: unknown): OfferTransition { return this.values.find((value) => value.wire === raw) ?? this.Unknown; }
  static for(status: OfferStatus): readonly OfferTransition[] {
    return this.values.filter((transition) => transition.permits(status));
  }
  static forOffer(offer: Offer): readonly OfferTransition[] {
    return offer.status !== OfferStatus.Unknown && offer.discountKind !== DiscountKind.Unknown ? this.for(offer.status) : [];
  }
}

export interface Offer {
  readonly id: number;
  readonly name: string;
  readonly status: OfferStatus;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountKind: DiscountKind;
  readonly discountValue: number;
  readonly minMarginPercent: number;
  readonly skus: readonly string[];
  readonly createdAt: string;
  readonly approvedAt: string | null;
}

export interface CreateOfferCommand {
  readonly name: string;
  readonly priority: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly discountKind: DiscountKind;
  readonly discountValue: number;
  readonly minMarginPercent: number;
  readonly skus: readonly string[];
}
