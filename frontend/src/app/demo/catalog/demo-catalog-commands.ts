import type { DemoProduct, DemoCatalogSnapshot } from './catalog-model';
import { DemoModuleId } from '../demo-model';
import { DemoSnapshotConflict } from './catalog-types';
import { DemoCatalogQuery } from './demo-catalog-query';
import { DemoProductPolicy } from './product-policy';

export interface DemoCatalogCommandPort {
  readonly catalog: DemoCatalogQuery;
  snapshot(): DemoCatalogSnapshot;
  requireCatalogAccess(actorId: string): void;
  requireModule(module: DemoModuleId): void;
  commit(projectStock?: boolean): void;
}

/** Product writes share revision and product policies; pricing writes belong to the commercial slice. */
export class DemoCatalogCommands {
  constructor(private readonly port: DemoCatalogCommandPort) {}

  saveProduct(requesterId: string, product: DemoProduct, editingSku?: string, expectedRevision = this.port.snapshot().revision): void {
    const snapshot = this.port.snapshot();
    this.port.requireCatalogAccess(requesterId);
    if (expectedRevision !== snapshot.revision) throw new DemoSnapshotConflict('El catálogo cambió. Recargá antes de guardar.');
    this.port.requireModule(DemoModuleId.Catalog);
    const existing = snapshot.products.find(value => value.sku === (editingSku ?? product.sku));
    if (!editingSku && existing) throw new DemoSnapshotConflict('El SKU ya existe. Editá el producto existente.');
    if (editingSku && (!existing || product.sku !== editingSku)) throw new DemoSnapshotConflict('El producto cambió o su SKU no coincide.');
    const proposed = DemoProductPolicy.clone(product);
    if (existing) {
      if (!DemoProductPolicy.known(existing)) throw new Error('El producto guardado contiene estados desconocidos.');
      DemoProductPolicy.preserveReservations(existing, proposed);
      for (const variant of proposed.variants) variant.reserved = existing.variants.find(value => value.id === variant.id)?.reserved ?? 0;
    } else proposed.variants.forEach(variant => variant.reserved = 0);
    DemoProductPolicy.validate(proposed);
    this.port.catalog.refreshTotals(proposed);
    if (existing) Object.assign(existing, proposed);
    else snapshot.products.push(proposed);
    this.port.commit(true);
  }

}
