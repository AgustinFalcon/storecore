export class OwnedSurfaceLink {
  private constructor(readonly wire: string, readonly path: string | null, readonly label: string) {}

  static readonly Catalog = new OwnedSurfaceLink('CATALOG', '/user/catalog', 'Ver catálogo');
  static readonly Inventory = new OwnedSurfaceLink('INVENTORY', '/user/inventory', 'Ver inventario');
  static readonly MercadoLibre = new OwnedSurfaceLink('MERCADO_LIBRE', '/user/mercadolibre', 'Ver Mercado Libre');
  static readonly None = new OwnedSurfaceLink('NONE', null, 'Sin superficie disponible');

  static fromWire(raw: unknown): OwnedSurfaceLink {
    return VALUES.find((value) => value.wire === raw) ?? OwnedSurfaceLink.None;
  }

  get isAvailable(): boolean { return this.path !== null; }
}

const VALUES = [OwnedSurfaceLink.Catalog, OwnedSurfaceLink.Inventory, OwnedSurfaceLink.MercadoLibre, OwnedSurfaceLink.None];
