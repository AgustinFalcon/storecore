import { manifestLooksUnsafe } from './profile-manifest';
import { ProfilePreview } from './user.entity';

export class ProfileImportPhase {
  static readonly Editing = new ProfileImportPhase('Editing', 'Editando manifiesto');
  static readonly Previewing = new ProfileImportPhase('Previewing', 'Consultando vista previa…', true);
  static readonly Reviewing = new ProfileImportPhase('Reviewing', 'Revisá los cambios');
  static readonly Confirming = new ProfileImportPhase('Confirming', 'Confirmación pendiente');
  static readonly Merging = new ProfileImportPhase('Merging', 'Aplicando selección…', true);
  static readonly Succeeded = new ProfileImportPhase('Succeeded', 'Importación aplicada');
  static readonly Failed = new ProfileImportPhase('Failed', 'No pudimos completar la operación');
  static readonly ResultUncertain = new ProfileImportPhase('ResultUncertain', 'Resultado incierto');
  static readonly AccessDenied = new ProfileImportPhase('AccessDenied', 'Acceso no disponible');
  static readonly Unknown = new ProfileImportPhase('Unknown', 'Estado no reconocido');
  private constructor(readonly wire: string, readonly label: string, readonly busy = false) {}
  static fromWire(value: unknown): ProfileImportPhase {
    return [this.Editing, this.Previewing, this.Reviewing, this.Confirming, this.Merging, this.Succeeded, this.Failed, this.ResultUncertain, this.AccessDenied].find((phase) => phase.wire === value) ?? this.Unknown;
  }
  get canEdit(): boolean { return !this.busy && this !== ProfileImportPhase.Confirming && this !== ProfileImportPhase.AccessDenied && this !== ProfileImportPhase.ResultUncertain; }
}

export class PreviewValidity {
  static readonly Missing = new PreviewValidity('Missing', 'Se necesita una vista previa');
  static readonly Stale = new PreviewValidity('Stale', 'Selección modificada: volvé a previsualizar');
  static readonly Valid = new PreviewValidity('Valid', 'Vista previa vigente para este texto');
  static readonly Incompatible = new PreviewValidity('Incompatible', 'Perfil incompatible');
  static readonly Unknown = new PreviewValidity('Unknown', 'Respuesta no reconocida');
  private constructor(readonly wire: string, readonly label: string) {}
  static fromWire(value: unknown): PreviewValidity {
    return [this.Missing, this.Stale, this.Valid, this.Incompatible].find((item) => item.wire === value) ?? this.Unknown;
  }
}

export class ProfileDiffOperation {
  static readonly Add = new ProfileDiffOperation('ADD', 'Agregar');
  static readonly Update = new ProfileDiffOperation('UPDATE', 'Actualizar');
  static readonly Unchanged = new ProfileDiffOperation('UNCHANGED', 'Sin cambios');
  static readonly Unknown = new ProfileDiffOperation('UNKNOWN', 'Operación no reconocida');
  private constructor(readonly wire: string, readonly label: string) {}
  static fromWire(value: unknown): ProfileDiffOperation {
    return [this.Add, this.Update, this.Unchanged].find((item) => item.wire === value) ?? this.Unknown;
  }
  get selectable(): boolean { return this !== ProfileDiffOperation.Unknown; }
}

export interface ProfileChange {
  readonly sectionKey: string;
  readonly operation: ProfileDiffOperation;
  readonly before: string;
  readonly after: string;
}
export class ProfileCompatibility {
  static readonly Compatible = new ProfileCompatibility('Compatible', 'Compatible', true);
  static readonly Incompatible = new ProfileCompatibility('Incompatible', 'Incompatible', false);
  static readonly Unknown = new ProfileCompatibility('Unknown', 'Respuesta no reconocida', false);
  private constructor(readonly wire: string, readonly label: string, readonly allowsMerge: boolean) {}
  static fromWire(value: unknown): ProfileCompatibility {
    return value === true ? this.Compatible : value === false ? this.Incompatible : this.Unknown;
  }
}
export interface ProfileReview {
  readonly compatibility: ProfileCompatibility;
  readonly version: string;
  readonly changes: readonly ProfileChange[];
  readonly known: boolean;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const keyPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/;
function snapshot(value: unknown, enforceIncomingLimit: boolean): boolean {
  return record(value)
    && Object.keys(value).every((key) => ['content', 'active', 'sortOrder'].includes(key))
    && record(value['content'])
    && typeof value['active'] === 'boolean'
    && typeof value['sortOrder'] === 'number'
    && Number.isInteger(value['sortOrder'])
    && value['sortOrder'] >= 0
    && (!enforceIncomingLimit || new TextEncoder().encode(JSON.stringify(value['content'])).length <= 20_000);
}

/** One translator for the preview array and merge {changes} JSON wire shapes. */
export class ProfileReviewDecoder {
  decode(preview: ProfilePreview): ProfileReview {
    try {
      if (manifestLooksUnsafe(preview.diff)) throw new Error('Sensitive response');
      const parsed: unknown = JSON.parse(preview.diff);
      const rows: unknown = Array.isArray(parsed) ? parsed : record(parsed) ? parsed['changes'] : null;
      if (!Array.isArray(rows) || rows.length > 100 || typeof preview.version !== 'string' || !preview.version || (preview.compatible && preview.version !== '1.0.0')) throw new Error('Invalid diff');
      const seen = new Set<string>();
      const changes = rows.map((row: unknown): ProfileChange => {
        if (!record(row) || typeof row['sectionKey'] !== 'string' || !keyPattern.test(row['sectionKey']) || seen.has(row['sectionKey'])) throw new Error('Invalid section');
        seen.add(row['sectionKey']);
        const operation = ProfileDiffOperation.fromWire(row['operation']);
        if (!snapshot(row['after'], true) || (row['before'] !== undefined && !snapshot(row['before'], false)) || ((operation === ProfileDiffOperation.Update || operation === ProfileDiffOperation.Unchanged) && row['before'] === undefined)) throw new Error('Invalid snapshot');
        return { sectionKey: row['sectionKey'], operation, before: row['before'] === undefined ? 'No existe' : JSON.stringify(row['before'], null, 2), after: JSON.stringify(row['after'], null, 2) };
      });
      const known = changes.every((change) => change.operation.selectable);
      return { compatibility: known ? ProfileCompatibility.fromWire(preview.compatible) : ProfileCompatibility.Unknown, version: preview.version, changes, known };
    } catch {
      return { compatibility: ProfileCompatibility.Unknown, version: '', changes: [], known: false };
    }
  }
}

/** Draft validation and final selection serialization have no UI or transport dependency. */
export class ProfileManifestDraft {
  parse(text: string): Record<string, unknown> {
    if (manifestLooksUnsafe(text)) throw new Error('Se detectó un posible secreto o credencial. Quitalo antes de continuar.');
    let root: unknown;
    try { root = JSON.parse(text); } catch { throw new Error('El manifiesto debe ser JSON válido.'); }
    if (!record(root)) throw new Error('El manifiesto debe ser un objeto JSON.');
    const allowed = ['profile_name', 'profile_version', 'version', 'coreCompatibility', 'core_compatibility', 'content', 'fixtures', 'mergeSelection', 'merge_selection'];
    if (Object.keys(root).some((key) => !allowed.includes(key)) || typeof root['profile_name'] !== 'string' || !root['profile_name'].trim() || typeof (root['profile_version'] ?? root['version']) !== 'string' || typeof (root['coreCompatibility'] ?? root['core_compatibility']) !== 'string' || (root['fixtures'] !== undefined && root['fixtures'] !== true) || (root['profile_version'] !== undefined && root['version'] !== undefined && root['profile_version'] !== root['version']) || (root['coreCompatibility'] !== undefined && root['core_compatibility'] !== undefined && root['coreCompatibility'] !== root['core_compatibility'])) throw new Error('Metadatos del perfil inválidos.');
    const content = root['content'];
    if (!record(content) || Object.keys(content).some((key) => key !== 'homeSections') || !Array.isArray(content['homeSections']) || content['homeSections'].length > 100) throw new Error('Se admiten hasta 100 secciones en content.homeSections.');
    const seen = new Set<string>();
    for (const row of content['homeSections'] as unknown[]) {
      if (!record(row) || Object.keys(row).some((key) => !['sectionKey', 'content', 'active', 'sortOrder'].includes(key)) || typeof row['sectionKey'] !== 'string' || !keyPattern.test(row['sectionKey']) || seen.has(row['sectionKey']) || !record(row['content']) || new TextEncoder().encode(JSON.stringify(row['content'])).length > 20_000 || (row['active'] !== undefined && typeof row['active'] !== 'boolean') || (row['sortOrder'] !== undefined && (typeof row['sortOrder'] !== 'number' || !Number.isInteger(row['sortOrder']) || row['sortOrder'] < 0 || row['sortOrder'] > 2147483647))) throw new Error('Sección inválida: clave única, contenido objeto de hasta 20.000 bytes y tipos válidos.');
      seen.add(row['sectionKey']);
    }
    return root;
  }
  select(text: string, selection: readonly string[]): string {
    const root = this.parse(text);
    const content = root['content'] as { homeSections: { sectionKey: string }[] };
    if (selection.some((key) => !content.homeSections.some((row) => row.sectionKey === key)) || new Set(selection).size !== selection.length) throw new Error('Selección inválida.');
    delete root['merge_selection'];
    return JSON.stringify({ ...root, mergeSelection: { homeSections: [...selection].sort() } }, null, 2);
  }
  keys(text: string): readonly string[] {
    const root = this.parse(text);
    return (root['content'] as { homeSections: { sectionKey: string }[] }).homeSections.map((row) => row.sectionKey);
  }
}
