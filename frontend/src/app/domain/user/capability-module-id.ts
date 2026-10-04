/**
 * Closed capability module ids. The wire is translated once.
 * The homologation console only lists known web-commerce modules.
 */
export class CapabilityModuleId {
  private constructor(
    readonly wire: string,
    readonly homologationVisible: boolean,
    readonly label: string,
  ) {}

  static readonly Storefront = new CapabilityModuleId('STOREFRONT', true, 'Vitrina');
  static readonly Catalog = new CapabilityModuleId('CATALOG', true, 'Catálogo');
  static readonly ProfileContent = new CapabilityModuleId('PROFILE_CONTENT', true, 'Contenido de inicio');
  static readonly PaymentsMp = new CapabilityModuleId('PAYMENTS_MP', true, 'Mercado Pago');
  static readonly ManualFulfillment = new CapabilityModuleId('MANUAL_FULFILLMENT', true, 'Entrega manual');
  static readonly MarketplaceMl = new CapabilityModuleId('MARKETPLACE_ML', true, 'Mercado Libre');
  static readonly ManualPromotions = new CapabilityModuleId('MANUAL_PROMOTIONS', true, 'Promociones');
  static readonly MlCompetitionInsights = new CapabilityModuleId(
    'ML_COMPETITION_INSIGHTS',
    true,
    'Señales de competencia (Mercado Libre)',
  );
  static readonly MlPriceAutomation = new CapabilityModuleId(
    'ML_PRICE_AUTOMATION',
    true,
    'Precio automático (Mercado Libre)',
  );
  static readonly MlPromotionOrchestrator = new CapabilityModuleId(
    'ML_PROMOTION_ORCHESTRATOR',
    true,
    'Promociones de Mercado Libre',
  );
  static readonly WebCrossSell = new CapabilityModuleId('WEB_CROSS_SELL_DISCOUNTS', true, 'Descuentos cruzados');
  static readonly CommercialCalendar = new CapabilityModuleId('COMMERCIAL_CALENDAR', true, 'Calendario comercial');
  static readonly Favorites = new CapabilityModuleId('FAVORITES', true, 'Favoritos');
  static readonly Loyalty = new CapabilityModuleId('LOYALTY', true, 'Fidelización');
  static readonly Carriers = new CapabilityModuleId('CARRIERS', true, 'Envíos');
  static readonly MlVirtualKits = new CapabilityModuleId('ML_VIRTUAL_KITS', true, 'Kits virtuales (Mercado Libre)');
  static readonly Unknown = new CapabilityModuleId('', false, 'Módulo no disponible');

  static fromWire(raw: string | null | undefined): CapabilityModuleId {
    return BY_WIRE.get(raw ?? '') ?? CapabilityModuleId.Unknown;
  }

  get isUnknown(): boolean {
    return this === CapabilityModuleId.Unknown;
  }
}

const KNOWN: readonly CapabilityModuleId[] = [
  CapabilityModuleId.Storefront,
  CapabilityModuleId.Catalog,
  CapabilityModuleId.ProfileContent,
  CapabilityModuleId.PaymentsMp,
  CapabilityModuleId.ManualFulfillment,
  CapabilityModuleId.MarketplaceMl,
  CapabilityModuleId.ManualPromotions,
  CapabilityModuleId.MlCompetitionInsights,
  CapabilityModuleId.MlPriceAutomation,
  CapabilityModuleId.MlPromotionOrchestrator,
  CapabilityModuleId.WebCrossSell,
  CapabilityModuleId.CommercialCalendar,
  CapabilityModuleId.Favorites,
  CapabilityModuleId.Loyalty,
  CapabilityModuleId.Carriers,
  CapabilityModuleId.MlVirtualKits,
];

const BY_WIRE = new Map(KNOWN.map((module) => [module.wire, module]));
