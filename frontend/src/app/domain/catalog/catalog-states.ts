export class ProductStatus {
  private constructor(readonly wire: string, readonly label: string, readonly isPublic: boolean = false) {}
  static readonly Draft = new ProductStatus('DRAFT', 'Borrador');
  static readonly Active = new ProductStatus('ACTIVE', 'Activo', true);
  static readonly Archived = new ProductStatus('ARCHIVED', 'Archivado');
  static readonly Unknown = new ProductStatus('UNKNOWN', 'Estado no informado');
  static readonly values = [ProductStatus.Draft, ProductStatus.Active, ProductStatus.Archived, ProductStatus.Unknown];
  static fromWire(raw: unknown): ProductStatus { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export class VariantStatus {
  private constructor(readonly wire: string, readonly label: string, readonly isPublic: boolean = false) {}
  static readonly Active = new VariantStatus('ACTIVE', 'Activa', true);
  static readonly Inactive = new VariantStatus('INACTIVE', 'Inactiva');
  static readonly Unknown = new VariantStatus('UNKNOWN', 'Estado no informado');
  static readonly values = [VariantStatus.Active, VariantStatus.Inactive, VariantStatus.Unknown];
  static fromWire(raw: unknown): VariantStatus { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}

export class InventoryState {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Known = new InventoryState('KNOWN', 'Saldo informado');
  static readonly Missing = new InventoryState('MISSING', 'Sin saldo registrado');
  static readonly Unknown = new InventoryState('UNKNOWN', 'Saldo no reconocido');
  static readonly values = [InventoryState.Known, InventoryState.Missing, InventoryState.Unknown];
  static fromWire(raw: unknown): InventoryState { return this.values.find(value => value.wire === raw) ?? this.Unknown; }
}
