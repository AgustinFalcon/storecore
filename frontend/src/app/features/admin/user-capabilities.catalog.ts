import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { DeliveryLevel } from '../../domain/user/delivery-level';
import { ModuleAvailability } from '../../domain/user/module-availability';
import { OwnedSurfaceLink } from '../../domain/user/owned-surface-link';
import { CapabilityModule } from '../../domain/user/user.entity';

export class CommercialCapabilityId {
  private constructor(readonly wire: string) {}
  static readonly Catalog = new CommercialCapabilityId('CATALOG');
  static readonly Inventory = new CommercialCapabilityId('INVENTORY');
  static readonly MercadoLibre = new CommercialCapabilityId('MERCADO_LIBRE');
  static readonly Outlet = new CommercialCapabilityId('OUTLET');
  static readonly Arca = new CommercialCapabilityId('ARCA');
  static readonly AdvancedShipping = new CommercialCapabilityId('ADVANCED_SHIPPING');
  static readonly WalletConnectors = new CommercialCapabilityId('WALLET_CONNECTORS');
  static readonly Unknown = new CommercialCapabilityId('UNKNOWN');
  static readonly values = Object.freeze([this.Catalog, this.Inventory, this.MercadoLibre, this.Outlet,
    this.Arca, this.AdvancedShipping, this.WalletConnectors]);
  static fromWire(raw: unknown): CommercialCapabilityId { return this.values.find((value) => value.wire === raw) ?? this.Unknown; }
}

interface CommercialDefinition {
  readonly id: CommercialCapabilityId;
  readonly name: string;
  readonly category: string;
  readonly summary: string;
  readonly detail: string;
  readonly productiveId: CapabilityModuleId | null;
  readonly availability: ModuleAvailability;
  readonly delivery: DeliveryLevel;
  readonly owner: OwnedSurfaceLink;
}

export interface CommercialCapabilityCard extends CommercialDefinition {
  readonly serverModule: CapabilityModule | null;
  readonly operationalLabel: string;
  readonly operationalTone: string;
  readonly ownerPath: string | null;
  readonly ownerLabel: string;
}

const DEFINITIONS: readonly CommercialDefinition[] = Object.freeze([
  { id: CommercialCapabilityId.Catalog, name: 'Catálogo', category: 'Operación base', summary: 'Administración de productos y oferta visible en la tienda.', detail: 'La ficha refleja el estado operativo autoritativo de CATALOG. La lectura no modifica productos ni configuración.', productiveId: CapabilityModuleId.Catalog, availability: ModuleAvailability.Available, delivery: DeliveryLevel.Integrated, owner: OwnedSurfaceLink.Catalog },
  { id: CommercialCapabilityId.Inventory, name: 'Inventario', category: 'Operación base', summary: 'Consulta de disponibilidad, reservas y stock de seguridad por SKU.', detail: 'La lectura de inventario tiene una superficie propia. Esta ficha es informativa porque no existe un ID productivo de capability para inventario.', productiveId: null, availability: ModuleAvailability.Available, delivery: DeliveryLevel.Integrated, owner: OwnedSurfaceLink.Inventory },
  { id: CommercialCapabilityId.MercadoLibre, name: 'Mercado Libre', category: 'Canal externo', summary: 'Estado de cuenta y mapeos de publicaciones disponibles para integración.', detail: 'El nivel indica preparación para integrar. No afirma sincronización automática, homologación ni cambios sobre Mercado Libre.', productiveId: CapabilityModuleId.MarketplaceMl, availability: ModuleAvailability.Available, delivery: DeliveryLevel.IntegrationReady, owner: OwnedSurfaceLink.MercadoLibre },
  { id: CommercialCapabilityId.Outlet, name: 'Outlet', category: 'Canal comercial', summary: 'Diseño del canal para unidades con condición y disponibilidad propias.', detail: 'El diseño está aprobado, pero esta ficha no crea un ID productivo ni afirma que el canal esté integrado.', productiveId: null, availability: ModuleAvailability.Available, delivery: DeliveryLevel.DesignApproved, owner: OwnedSurfaceLink.Catalog },
  { id: CommercialCapabilityId.Arca, name: 'ARCA', category: 'Fiscal', summary: 'Diseño previsto para el estado fiscal posterior a un pago confirmado.', detail: 'La emisión fiscal real y su homologación pertenecen a una etapa futura. Esta pantalla no emite comprobantes.', productiveId: null, availability: ModuleAvailability.Deferred, delivery: DeliveryLevel.DesignApproved, owner: OwnedSurfaceLink.None },
  { id: CommercialCapabilityId.AdvancedShipping, name: 'Envíos avanzados', category: 'Logística', summary: 'Experiencia demostrativa pendiente de credenciales y proveedor de envíos.', detail: 'La dependencia externa está bloqueada. No se promete cotización, etiqueta, seguimiento ni entrega productiva.', productiveId: null, availability: ModuleAvailability.DependencyBlocked, delivery: DeliveryLevel.DemoApproved, owner: OwnedSurfaceLink.None },
  { id: CommercialCapabilityId.WalletConnectors, name: 'Conectores de billeteras', category: 'Cobros', summary: 'Diseño para incorporar proveedores de pago mediante conectores separados.', detail: 'Cada proveedor requiere su propio contrato y homologación. Esta ficha no confirma QR ni cobros productivos.', productiveId: null, availability: ModuleAvailability.Deferred, delivery: DeliveryLevel.DesignApproved, owner: OwnedSurfaceLink.None },
]);

export function commercialCapabilityCards(modules: readonly CapabilityModule[]): readonly CommercialCapabilityCard[] {
  return DEFINITIONS.map((definition) => {
    const serverModule = definition.productiveId === null ? null : modules.find((item) => item.id === definition.productiveId) ?? null;
    const operationalLabel = definition.productiveId === null ? 'No aplica' : serverModule?.state.label ?? 'Estado no disponible';
    return { ...definition, serverModule, operationalLabel, operationalTone: serverModule?.state.tone ?? 'neutral',
      ownerPath: definition.owner.path, ownerLabel: definition.owner.label };
  });
}
