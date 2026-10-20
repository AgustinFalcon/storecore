import type { DemoProductVariantRecord } from '../catalog/catalog-model';
import type { DemoCartLine } from './checkout-model';
import { DemoDeliveryMethod } from '../demo-process-types';

/** Delivery eligibility is derived from catalog facts, never from fixed UI copy. */
export class DemoDeliveryPolicy {
  static forVariant(variant: DemoProductVariantRecord | undefined): readonly DemoDeliveryMethod[] {
    return variant?.pickupLocation?.trim()
      ? [DemoDeliveryMethod.Home, DemoDeliveryMethod.Pickup]
      : [DemoDeliveryMethod.Home];
  }

  static forCart(
    lines: readonly DemoCartLine[],
    variant: (sku: string, variantId: string) => DemoProductVariantRecord,
  ): readonly DemoDeliveryMethod[] {
    if (!lines.length) return [DemoDeliveryMethod.Home];
    const locations = lines.map(line => variant(line.sku, line.variantId).pickupLocation?.trim() ?? '');
    return locations.every(location => location && location === locations[0])
      ? [DemoDeliveryMethod.Home, DemoDeliveryMethod.Pickup]
      : [DemoDeliveryMethod.Home];
  }

  static pickupLocation(
    lines: readonly DemoCartLine[],
    variant: (sku: string, variantId: string) => DemoProductVariantRecord,
  ): string | null {
    return this.forCart(lines, variant).includes(DemoDeliveryMethod.Pickup)
      ? variant(lines[0].sku, lines[0].variantId).pickupLocation!.trim()
      : null;
  }
}
