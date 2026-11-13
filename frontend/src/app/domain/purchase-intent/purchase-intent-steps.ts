import { Cart } from '../cart/cart.entity';
import { ProductDetail } from '../catalog/product-detail.entity';
import { PurchaseIntent, RestoredPurchaseAvailability } from './purchase-intent';
import { ClockPort, OpaqueIdPort, PurchaseIntentStoragePort, PurchaseIntentStorageResult } from './purchase-intent-storage.port';

export class CapturePurchaseIntentStep {
  constructor(private readonly clock: ClockPort, private readonly ids: OpaqueIdPort) {}
  execute(productSku: string, variantSku: string, quantity: number): PurchaseIntent {
    return PurchaseIntent.capture(this.ids.next(), productSku, variantSku, quantity, this.clock.now());
  }
}
export class PersistPurchaseIntentStep {
  constructor(private readonly storage: PurchaseIntentStoragePort) {}
  execute(intent: PurchaseIntent): PurchaseIntentStorageResult { return this.storage.save(intent); }
}
export class RestoreExactSelectionStep {
  execute(intent: PurchaseIntent, product: ProductDetail | null): RestoredPurchaseAvailability {
    if (!product || product.sku !== intent.productSku || !product.active || !product.status.isPublic) return RestoredPurchaseAvailability.ProductUnavailable;
    const variant = product.variants.find(value => value.sku === intent.variantSku);
    if (!variant?.status.isPublic) return RestoredPurchaseAvailability.VariantUnavailable;
    if (!Number.isSafeInteger(variant.availableQuantity) || variant.availableQuantity === null || variant.availableQuantity < intent.quantity) return RestoredPurchaseAvailability.QuantityUnavailable;
    return RestoredPurchaseAvailability.Ready;
  }
  currentQuantity(intent: PurchaseIntent, cart: Cart): number { return cart.lines.find(line => line.sku === intent.variantSku)?.quantity ?? 0; }
}
export class CompletePurchaseIntentStep {
  constructor(private readonly storage: PurchaseIntentStoragePort) {}
  execute(intent: PurchaseIntent): PurchaseIntentStorageResult { return this.storage.clear(intent.flowId); }
}
