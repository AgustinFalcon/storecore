import { ContentDraft, ContentDraftData, ContentDraftIssue } from './content-draft';
import { ContentEditPhase as Phase } from './content-types';

export interface ContentFlowPort {
  authorized(): boolean;
  epoch(): number;
  read(): ContentDraftData;
  save(draft: ContentDraftData, epoch: number): Promise<boolean>;
  error(): string;
}
export class ValidateContentStep { execute(draft: ContentDraftData): ContentDraftIssue { return ContentDraft.issue(draft); } }
export class PreviewContentStep { execute(draft: ContentDraftData): ContentDraftData { return ContentDraft.clone(draft); } }
export class DiscardContentStep { execute(saved: ContentDraftData): ContentDraftData { return ContentDraft.clone(saved); } }
export class SaveContentStep {
  constructor(private readonly port: ContentFlowPort) {}
  execute(draft: ContentDraftData, epoch: number): Promise<boolean> { return this.port.save(ContentDraft.clone(draft), epoch); }
}

/** Orders isolated steps; the injected adapter alone may transact a snapshot. */
export class ContentFlow {
  private readonly validateStep = new ValidateContentStep();
  private readonly previewStep = new PreviewContentStep();
  private readonly discardStep = new DiscardContentStep();
  private readonly saveStep: SaveContentStep;
  private saved = ContentDraft.empty();
  private generation = 0;
  private disposed = false;
  draft = ContentDraft.empty();
  phase = Phase.Denied;
  issue = ContentDraftIssue.None;
  error = '';

  constructor(private readonly port: ContentFlowPort, private readonly changed: () => void = () => undefined) { this.saveStep = new SaveContentStep(port); this.refresh(); }
  get dirty(): boolean { return !ContentDraft.same(this.draft, this.saved); }
  get canEdit(): boolean { return !this.disposed && this.port.authorized() && this.phase.canEdit; }
  refresh(): void {
    this.generation++;
    this.saved = !this.disposed && this.port.authorized() ? ContentDraft.clone(this.port.read()) : ContentDraft.empty();
    this.draft = this.discardStep.execute(this.saved); this.issue = ContentDraftIssue.None; this.error = '';
    this.phase = !this.disposed && this.port.authorized() ? Phase.Editing : Phase.Denied; this.changed();
  }
  edit(): void { if (!this.canEdit) return; this.phase = Phase.Editing; this.issue = ContentDraftIssue.None; this.error = ''; this.changed(); }
  reorder(index: number, delta: number): void { if (!this.canEdit) return; this.draft = ContentDraft.reorder(this.draft, index, delta); this.edit(); }
  preview(): ContentDraftData { return this.previewStep.execute(this.draft); }
  discard(): void { if (!this.canEdit) return; this.draft = this.discardStep.execute(this.saved); this.edit(); }
  async save(): Promise<void> {
    if (!this.canEdit || !this.dirty) return;
    this.issue = this.validateStep.execute(this.draft);
    if (this.issue !== ContentDraftIssue.None) { this.phase = Phase.Invalid; this.changed(); return; }
    const draft = ContentDraft.clone(this.draft), epoch = this.port.epoch(), generation = ++this.generation;
    this.phase = Phase.Saving; this.error = ''; this.changed();
    let saved = false;
    try { saved = await this.saveStep.execute(draft, epoch); } catch { /* adapter failure cannot become success */ }
    if (this.disposed || generation !== this.generation) return;
    if (epoch !== this.port.epoch() || !this.port.authorized()) { this.refresh(); return; }
    if (saved) { this.saved = draft; this.phase = this.dirty ? Phase.Editing : Phase.Saved; }
    else { this.phase = Phase.Failure; this.error = this.port.error() || 'El borrador no se guardó. Conservamos tus cambios para reintentar.'; }
    this.changed();
  }
  dispose(): void { this.disposed = true; this.refresh(); }
}
