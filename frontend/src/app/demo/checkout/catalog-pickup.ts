import type { DemoSnapshot } from '../demo-model';
import { DemoProductVariant } from '../catalog/product-variant';
import { VariantSaleState } from '../catalog/catalog-types';

export class PickupAvailability {
  private constructor(readonly wire: string, readonly label: string, readonly eligible: boolean) {}
  static readonly Configured = new PickupAvailability('configured', 'Retiro disponible', true);
  static readonly NotConfigured = new PickupAvailability('not-configured', 'Retiro no disponible para estos productos. Elegí envío a domicilio.', false);
  static readonly Unknown = new PickupAvailability('', 'No se pudo validar el retiro. Elegí envío a domicilio.', false);
  static readonly all = [this.Configured, this.NotConfigured] as const;
  static fromWire(raw: unknown): PickupAvailability { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

/** One boundary for the optional, merchant-configured destination. */
export class PickupDestination {
  private constructor(readonly availability: PickupAvailability, readonly location: string) {}
  static readonly NotConfigured = new PickupDestination(PickupAvailability.NotConfigured, '');
  static readonly Unknown = new PickupDestination(PickupAvailability.Unknown, '');
  static fromWire(raw: unknown): PickupDestination {
    if (raw === undefined) return this.NotConfigured;
    return typeof raw === 'string' && !!raw.trim() && raw.length <= 240
      ? new PickupDestination(PickupAvailability.Configured, raw.trim()) : this.Unknown;
  }
}

export interface PickupCartLine { readonly sku: string; readonly variant: DemoProductVariant; }

/** Every selected presentation must name the same currently enabled destination. */
export class QuoteCatalogPickupStep {
  execute(snapshot: DemoSnapshot, lines: readonly PickupCartLine[]): PickupDestination {
    if (!lines.length) return PickupDestination.NotConfigured;
    const destinations = lines.map(line => {
      const product = snapshot.products.find(value => value.sku === line.sku);
      const presentation = snapshot.catalogDetails.find(value => value.sku === line.sku)?.variants.find(value => value.variant === line.variant);
      if (!product?.active || line.variant === DemoProductVariant.Unknown || !presentation || presentation.state !== VariantSaleState.Active) return PickupDestination.Unknown;
      return PickupDestination.fromWire(presentation.pickupLocation);
    });
    if (destinations.some(value => value.availability === PickupAvailability.Unknown)) return PickupDestination.Unknown;
    if (destinations.some(value => !value.availability.eligible || value.location !== destinations[0].location)) return PickupDestination.NotConfigured;
    return destinations[0];
  }
}
