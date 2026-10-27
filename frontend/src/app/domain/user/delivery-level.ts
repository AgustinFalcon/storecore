export class DeliveryLevel {
  private constructor(readonly wire: string, readonly label: string) {}

  static readonly DesignApproved = new DeliveryLevel('DESIGN_APPROVED', 'Diseño aprobado');
  static readonly DemoApproved = new DeliveryLevel('DEMO_APPROVED', 'Demostración aprobada');
  static readonly IntegrationReady = new DeliveryLevel('INTEGRATION_READY', 'Listo para integrar');
  static readonly Integrated = new DeliveryLevel('INTEGRATED', 'Integrado');
  static readonly Homologated = new DeliveryLevel('HOMOLOGATED', 'Homologado');
  static readonly Unknown = new DeliveryLevel('UNKNOWN', 'Nivel no determinado');

  static fromWire(raw: unknown): DeliveryLevel {
    return VALUES.find((value) => value.wire === raw) ?? DeliveryLevel.Unknown;
  }
}

const VALUES = [DeliveryLevel.DesignApproved, DeliveryLevel.DemoApproved, DeliveryLevel.IntegrationReady,
  DeliveryLevel.Integrated, DeliveryLevel.Homologated];
