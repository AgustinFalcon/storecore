export class CapabilityModuleId {
  private constructor(readonly wire: string, readonly label: string) {}

  static readonly Storefront = new CapabilityModuleId('STOREFRONT', 'Tienda pública');
  static readonly Catalog = new CapabilityModuleId('CATALOG', 'Catálogo');
  static readonly ProfileContent = new CapabilityModuleId('PROFILE_CONTENT', 'Contenido y perfiles');
  static readonly PaymentsMp = new CapabilityModuleId('PAYMENTS_MP', 'Pagos con Mercado Pago');
  static readonly ManualFulfillment = new CapabilityModuleId('MANUAL_FULFILLMENT', 'Preparación y entregas');
  static readonly MarketplaceMl = new CapabilityModuleId('MARKETPLACE_ML', 'Mercado Libre');
  static readonly ManualPromotions = new CapabilityModuleId('MANUAL_PROMOTIONS', 'Promociones manuales');
  static readonly MlCompetitionInsights = new CapabilityModuleId('ML_COMPETITION_INSIGHTS', 'Inteligencia competitiva');
  static readonly MlPriceAutomation = new CapabilityModuleId('ML_PRICE_AUTOMATION', 'Automatización de precios');
  static readonly MlPromotionOrchestrator = new CapabilityModuleId('ML_PROMOTION_ORCHESTRATOR', 'Promociones de Mercado Libre');
  static readonly WebCrossSellDiscounts = new CapabilityModuleId('WEB_CROSS_SELL_DISCOUNTS', 'Descuentos combinados');
  static readonly CommercialCalendar = new CapabilityModuleId('COMMERCIAL_CALENDAR', 'Calendario comercial');
  static readonly Favorites = new CapabilityModuleId('FAVORITES', 'Favoritos');
  static readonly Loyalty = new CapabilityModuleId('LOYALTY', 'Fidelización');
  static readonly Carriers = new CapabilityModuleId('CARRIERS', 'Transportistas');
  static readonly MlVirtualKits = new CapabilityModuleId('ML_VIRTUAL_KITS', 'Kits virtuales de Mercado Libre');
  static readonly Unknown = new CapabilityModuleId('UNKNOWN', 'Módulo no reconocido');

  static readonly values: readonly CapabilityModuleId[] = Object.freeze([
    CapabilityModuleId.Storefront, CapabilityModuleId.Catalog, CapabilityModuleId.ProfileContent,
    CapabilityModuleId.PaymentsMp, CapabilityModuleId.ManualFulfillment, CapabilityModuleId.MarketplaceMl,
    CapabilityModuleId.ManualPromotions, CapabilityModuleId.MlCompetitionInsights, CapabilityModuleId.MlPriceAutomation,
    CapabilityModuleId.MlPromotionOrchestrator, CapabilityModuleId.WebCrossSellDiscounts, CapabilityModuleId.CommercialCalendar,
    CapabilityModuleId.Favorites, CapabilityModuleId.Loyalty, CapabilityModuleId.Carriers, CapabilityModuleId.MlVirtualKits,
  ]);

  static fromWire(raw: unknown): CapabilityModuleId {
    return CapabilityModuleId.values.find((value) => value.wire === raw) ?? CapabilityModuleId.Unknown;
  }
}
