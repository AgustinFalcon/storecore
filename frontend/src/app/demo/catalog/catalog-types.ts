export class ProductPublication {
  private constructor(readonly wire: string, readonly label: string, readonly published: boolean, readonly actionLabel: string, readonly confirmation: string) {}
  static readonly Published = new ProductPublication('PUBLISHED', 'Publicado', true, 'Archivar', 'Archivar retira el producto de la tienda y conserva variantes, stock e historial.');
  static readonly Archived = new ProductPublication('ARCHIVED', 'Archivado', false, 'Publicar', 'Publicar muestra el producto y sus variantes habilitadas en la tienda.');
  static readonly Unknown = new ProductPublication('', 'Publicación desconocida', false, 'No disponible', 'El estado no permite cambios.');
  static fromWire(raw: unknown): ProductPublication { return [this.Published, this.Archived].find(value => value.wire === raw) ?? this.Unknown; }
  get next(): ProductPublication { return this === ProductPublication.Published ? ProductPublication.Archived : this === ProductPublication.Archived ? ProductPublication.Published : ProductPublication.Unknown; }
}
export class VariantSaleState {
  private constructor(readonly wire: string, readonly label: string, readonly active: boolean) {}
  static readonly Active = new VariantSaleState('ACTIVE', 'Habilitada para vender', true);
  static readonly Disabled = new VariantSaleState('DISABLED', 'Deshabilitada', false);
  static readonly Unknown = new VariantSaleState('', 'Activación desconocida', false);
  static readonly all = [this.Active, this.Disabled];
  static fromWire(raw: unknown): VariantSaleState { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class ProductCondition {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Standard = new ProductCondition('STANDARD', 'Producto estándar');
  static readonly Outlet = new ProductCondition('OUTLET', 'Outlet por unidad o lote');
  static readonly Unknown = new ProductCondition('', 'Condición desconocida');
  static readonly all = [this.Standard, this.Outlet];
  static fromWire(raw: unknown): ProductCondition { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class OutletScope {
  private constructor(readonly wire: string, readonly label: string, readonly maximumUnits: number) {}
  static readonly Unit = new OutletScope('UNIT', 'Unidad identificada', 1);
  static readonly Lot = new OutletScope('LOT', 'Lote identificado', Number.MAX_SAFE_INTEGER);
  static readonly Unknown = new OutletScope('', 'Alcance desconocido', 0);
  static readonly all = [this.Unit, this.Lot];
  static fromWire(raw: unknown): OutletScope { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class CatalogEditorPhase {
  private constructor(readonly label: string) {}
  static readonly List = new CatalogEditorPhase('');
  static readonly Editing = new CatalogEditorPhase('Cambios sin guardar');
  static readonly Saving = new CatalogEditorPhase('Guardando producto…');
  static readonly Validation = new CatalogEditorPhase('Revisá los datos del producto.');
  static readonly Failure = new CatalogEditorPhase('No se pudo guardar. Se conserva la propuesta.');
  static readonly Conflict = new CatalogEditorPhase('El catálogo cambió. Se conserva la propuesta; recargá la versión guardada antes de volver a editar.');
  static readonly Success = new CatalogEditorPhase('Producto guardado.');
  static readonly Denied = new CatalogEditorPhase('No tenés permiso para editar el catálogo.');
}
export class DemoSnapshotConflict extends Error {}
export class CatalogValidationError extends Error {}
export class DemoMutationFailure {
  private constructor() {}
  static readonly None = new DemoMutationFailure();
  static readonly Conflict = new DemoMutationFailure();
  static readonly Failure = new DemoMutationFailure();
}
