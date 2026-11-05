export class ModuleAvailability {
  private constructor(readonly wire: string, readonly label: string, readonly tone: string) {}

  static readonly Available = new ModuleAvailability('AVAILABLE', 'Disponible', 'success');
  static readonly DependencyBlocked = new ModuleAvailability('DEPENDENCY_BLOCKED', 'Bloqueado por dependencia', 'warning');
  static readonly Deferred = new ModuleAvailability('DEFERRED', 'Planificado para una etapa posterior', 'neutral');
  static readonly Unknown = new ModuleAvailability('UNKNOWN', 'Disponibilidad no determinada', 'neutral');

  static fromWire(raw: unknown): ModuleAvailability {
    return VALUES.find((value) => value.wire === raw) ?? ModuleAvailability.Unknown;
  }
}

const VALUES = [ModuleAvailability.Available, ModuleAvailability.DependencyBlocked, ModuleAvailability.Deferred];
