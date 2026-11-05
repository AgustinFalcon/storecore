export class HomeContentPhase {
  private constructor(readonly wire: string, readonly label: string, readonly busy = false) {}
  static readonly Loading = new HomeContentPhase('loading', 'Cargando contenido publicado.', true);
  static readonly Clean = new HomeContentPhase('clean', 'Sin cambios pendientes.');
  static readonly Editing = new HomeContentPhase('editing', 'Tenés cambios sin publicar.');
  static readonly Invalid = new HomeContentPhase('invalid', 'Revisá el contenido antes de publicar.');
  static readonly Saving = new HomeContentPhase('saving', 'Publicando cambios. Esperá antes de salir.', true);
  static readonly Success = new HomeContentPhase('success', 'Contenido publicado correctamente.');
  static readonly Error = new HomeContentPhase('error', 'No pudimos completar la operación.');
  static readonly AccessDenied = new HomeContentPhase('access-denied', 'Tu sesión no permite editar el contenido. Volvé a ingresar.');
  static readonly Unknown = new HomeContentPhase('unknown', 'Estado no reconocido.');
  static readonly all = [this.Loading, this.Clean, this.Editing, this.Invalid, this.Saving, this.Success, this.Error, this.AccessDenied];
  static fromWire(raw: unknown): HomeContentPhase { return this.all.find((value) => value.wire === raw) ?? this.Unknown; }
}
