export class PolicyStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Draft = new PolicyStatus('DRAFT', 'Borrador');
  static readonly Active = new PolicyStatus('ACTIVE', 'Activa');
  static readonly Paused = new PolicyStatus('PAUSED', 'Pausada');
  static readonly Ended = new PolicyStatus('ENDED', 'Finalizada');
  static readonly Unknown = new PolicyStatus('UNKNOWN', 'Estado no reconocido');
  static fromWire(raw: unknown): PolicyStatus { return [this.Draft, this.Active, this.Paused, this.Ended].find(value => value.wire === raw) ?? this.Unknown; }
}

export class PolicyTransition {
  private constructor(readonly wire: string, readonly label: string, private readonly sources: readonly PolicyStatus[]) {}
  static readonly Activate = new PolicyTransition('ACTIVATE', 'Activar', [PolicyStatus.Draft, PolicyStatus.Paused]);
  static readonly Pause = new PolicyTransition('PAUSE', 'Pausar', [PolicyStatus.Active]);
  static readonly End = new PolicyTransition('END', 'Finalizar', [PolicyStatus.Active, PolicyStatus.Paused]);
  static readonly Unknown = new PolicyTransition('UNKNOWN', 'Transición no reconocida', []);
  static fromWire(raw: unknown): PolicyTransition { return [this.Activate, this.Pause, this.End].find(value => value.wire === raw) ?? this.Unknown; }
  static for(status: PolicyStatus): readonly PolicyTransition[] { return [this.Activate, this.Pause, this.End].filter(value => value.sources.includes(status)); }
}

export class PriceScope {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Default = new PriceScope('DEFAULT', 'Predeterminado');
  static readonly Campaign = new PriceScope('CAMPAIGN', 'Campaña');
  static readonly Unknown = new PriceScope('UNKNOWN', 'Alcance no reconocido');
  static readonly selectable = [PriceScope.Default, PriceScope.Campaign];
  static fromWire(raw: unknown): PriceScope { return this.selectable.find(value => value.wire === raw) ?? this.Unknown; }
}

export class PriceWriter {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Manual = new PriceWriter('MANUAL', 'Manual');
  static readonly Unknown = new PriceWriter('UNKNOWN', 'Writer no reconocido');
  static fromWire(raw: unknown): PriceWriter { return raw === this.Manual.wire ? this.Manual : this.Unknown; }
}

export class PriceCurrency {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Ars = new PriceCurrency('ARS', 'ARS');
  static readonly Unknown = new PriceCurrency('UNKNOWN', 'Moneda no reconocida');
  static fromWire(raw: unknown): PriceCurrency { return raw === this.Ars.wire ? this.Ars : this.Unknown; }
}

export class ChannelAvailability {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Known = new ChannelAvailability('KNOWN', 'Registro local disponible');
  static readonly Unavailable = new ChannelAvailability('UNAVAILABLE', 'No disponible');
  static readonly Unknown = new ChannelAvailability('UNKNOWN', 'Disponibilidad no reconocida');
  static fromWire(raw: unknown): ChannelAvailability { return [this.Known, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown; }
}

export class ObservationFreshness {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Unverified = new ObservationFreshness('UNVERIFIED', 'Histórica · vigencia sin verificar');
  static readonly Unavailable = new ObservationFreshness('UNAVAILABLE', 'Observación no disponible');
  static readonly Unknown = new ObservationFreshness('UNKNOWN', 'Vigencia no reconocida');
  static fromWire(raw: unknown): ObservationFreshness { return [this.Unverified, this.Unavailable].find(value => value.wire === raw) ?? this.Unknown; }
}

export class ChannelFactReason {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly ExternalNotAvailable = new ChannelFactReason('EXTERNAL_NOT_AVAILABLE', 'Fuente externa no disponible');
  static readonly Unknown = new ChannelFactReason('UNKNOWN', 'Motivo no reconocido');
  static fromWire(raw: unknown): ChannelFactReason { return raw === this.ExternalNotAvailable.wire ? this.ExternalNotAvailable : this.Unknown; }
}

export class ListingStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Active = new ListingStatus('ACTIVE', 'Activa');
  static readonly Paused = new ListingStatus('PAUSED', 'Pausada');
  static readonly Disabled = new ListingStatus('DISABLED', 'Deshabilitada');
  static readonly ReadOnly = new ListingStatus('READ_ONLY', 'Sólo lectura');
  static readonly Error = new ListingStatus('ERROR', 'Requiere atención');
  static readonly Unknown = new ListingStatus('UNKNOWN', 'Estado no reconocido');
  static fromWire(raw: unknown): ListingStatus { return [this.Active, this.Paused, this.Disabled, this.ReadOnly, this.Error].find(value => value.wire === raw) ?? this.Unknown; }
}

export interface ChannelObservation {
  readonly state: ChannelAvailability;
  readonly value: number | null;
  readonly freshness: ObservationFreshness;
  readonly reason: ChannelFactReason | null;
}

export interface CreateManualPromo {
  readonly listingSku: string;
  readonly currency: PriceCurrency;
  readonly priceScope: PriceScope;
  readonly desiredPrice: number;
  readonly effectivePromoPrice: number | null;
  readonly validFrom: string;
  readonly validTo: string;
  readonly writer: PriceWriter;
}
