import { DemoContext } from '../demo-model';
import { UserRole } from '../../domain/user/user-role';

export class ContentEditPhase {
  private constructor(readonly wire: string, readonly label: string, readonly canEdit: boolean) {}
  static readonly Editing = new ContentEditPhase('editing', 'Editando borrador', true);
  static readonly Saving = new ContentEditPhase('saving', 'Guardando borrador…', false);
  static readonly Saved = new ContentEditPhase('saved', 'Borrador guardado', true);
  static readonly Invalid = new ContentEditPhase('invalid', 'Revisá el contenido', true);
  static readonly Failure = new ContentEditPhase('failure', 'No se pudo guardar', true);
  static readonly Denied = new ContentEditPhase('denied', 'Acceso denegado', false);
  static readonly Unknown = new ContentEditPhase('', 'Estado desconocido', false);
  static readonly all = [this.Editing, this.Saving, this.Saved, this.Invalid, this.Failure, this.Denied] as const;
  static fromWire(raw: unknown): ContentEditPhase { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ContentDialog {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly None = new ContentDialog('none', '');
  static readonly Preview = new ContentDialog('preview', 'Vista previa del borrador');
  static readonly Discard = new ContentDialog('discard', 'Descartar cambios');
  static readonly Unknown = new ContentDialog('', 'Diálogo desconocido');
  static readonly all = [this.None, this.Preview, this.Discard] as const;
  static fromWire(raw: unknown): ContentDialog { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}

export class ContentAuthority {
  static permits(context: DemoContext, role: UserRole): boolean { return context === DemoContext.Admin && (role === UserRole.Admin || role === UserRole.Operator); }
}

export class ContentDraftStatus {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Clean = new ContentDraftStatus('clean', 'Sin cambios pendientes');
  static readonly Dirty = new ContentDraftStatus('dirty', 'Cambios sin guardar');
  static readonly Unknown = new ContentDraftStatus('', 'Estado del borrador desconocido');
  static readonly all = [this.Clean, this.Dirty] as const;
  static fromWire(raw: unknown): ContentDraftStatus { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  static of(dirty: boolean): ContentDraftStatus { return dirty ? this.Dirty : this.Clean; }
}

export class ContentDiscardIntent {
  private constructor(readonly wire: string, readonly title: string, readonly actionLabel: string) {}
  static readonly Local = new ContentDiscardIntent('local', 'Descartar cambios', 'Descartar cambios');
  static readonly Leave = new ContentDiscardIntent('leave', 'Salir sin guardar', 'Descartar y salir');
  static readonly Unknown = new ContentDiscardIntent('', 'Acción desconocida', 'No disponible');
  static readonly all = [this.Local, this.Leave] as const;
  static fromWire(raw: unknown): ContentDiscardIntent { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  static of(leaving: boolean): ContentDiscardIntent { return leaving ? this.Leave : this.Local; }
}
