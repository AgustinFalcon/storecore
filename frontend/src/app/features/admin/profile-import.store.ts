import { effect, Injectable, OnDestroy } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { defer, Subscription, timeout } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { ProfileImportPhase, PreviewValidity, ProfileReview, ProfileManifestDraft } from '../../domain/user/profile-import';
import { ProfileConfirmationStep, ProfileMergeResultStep, ProfilePreviewStep, ProfileSelectionStep } from '../../domain/user/profile-import-steps';
import { ImportProfileUseCase } from '../../domain/user/use-cases/import-profile.usecase';

export interface ProfileImportState {
  readonly phase: ProfileImportPhase;
  readonly validity: PreviewValidity;
  readonly manifest: string;
  readonly previewManifest: string | null;
  readonly review: ProfileReview | null;
  readonly selection: readonly string[];
  readonly message: string;
}
const initialState = (): ProfileImportState => ({ phase: ProfileImportPhase.Editing, validity: PreviewValidity.Missing, manifest: '', previewManifest: null, review: null, selection: [], message: '' });

@Injectable()
export class ProfileImportStore extends ComponentStore<ProfileImportState> implements OnDestroy {
  private readonly draft = new ProfileManifestDraft();
  private readonly selectionStep = new ProfileSelectionStep();
  private readonly previewStep = new ProfilePreviewStep();
  private readonly confirmationStep = new ProfileConfirmationStep();
  private readonly mergeResultStep = new ProfileMergeResultStep();
  private request?: Subscription;
  private generation = 0;
  private actor: string | null;
  constructor(private readonly importer: ImportProfileUseCase, private readonly session: UserSession) {
    super(initialState());
    this.actor = this.currentActor();
    if (!this.actor) this.deny();
    effect(() => {
      const actor = this.currentActor();
      if (actor !== this.actor) {
        this.generation++;
        this.request?.unsubscribe();
        this.actor = actor;
        this.setState(actor ? initialState() : { ...initialState(), phase: ProfileImportPhase.AccessDenied });
      }
    });
  }
  get snapshot(): ProfileImportState { return this.get(); }
  private currentActor(): string | null {
    return this.session.authenticated() && this.session.roles().includes(UserRole.Admin) ? this.session.principal()?.id ?? null : null;
  }
  private hasAccess(): boolean {
    const actor = this.currentActor();
    if (!actor || actor !== this.actor) {
      this.generation++; this.request?.unsubscribe(); this.actor = actor;
      this.setState(actor ? initialState() : { ...initialState(), phase: ProfileImportPhase.AccessDenied });
      return false;
    }
    return this.snapshot.phase !== ProfileImportPhase.AccessDenied;
  }
  private deny(): void {
    this.generation++; this.request?.unsubscribe();
    this.setState({ ...initialState(), phase: ProfileImportPhase.AccessDenied, message: 'Necesitás una sesión interna con permiso de administración.' });
  }
  setManifest(manifest: string): void {
    if (!this.hasAccess() || !this.snapshot.phase.canEdit) return;
    this.generation++;
    this.patchState({ manifest, review: null, selection: [], previewManifest: null, validity: PreviewValidity.Missing, phase: ProfileImportPhase.Editing, message: '' });
  }
  selectSection(key: string, selected: boolean): void {
    if (!this.hasAccess() || this.snapshot.phase !== ProfileImportPhase.Reviewing || !this.snapshot.review?.known || !this.snapshot.review.compatibility.allowsMerge || !this.snapshot.review.changes.some((row) => row.sectionKey === key && row.operation.selectable)) return;
    const selection = this.snapshot.selection.filter((item) => item !== key);
    if (selected) selection.push(key);
    try {
      const manifest = this.selectionStep.execute(this.snapshot.manifest, selection);
      this.generation++;
      this.patchState({ manifest, selection, previewManifest: null, validity: PreviewValidity.Stale, message: '' });
    } catch { this.patchState({ message: 'No se pudo construir la selección. Volvé a editar el manifiesto.' }); }
  }
  previewProfile(): void {
    if (!this.hasAccess() || !this.snapshot.phase.canEdit) return;
    const manifest = this.snapshot.manifest;
    try { this.draft.parse(manifest); } catch (error) {
      this.patchState({ phase: ProfileImportPhase.Failed, validity: PreviewValidity.Missing, previewManifest: null, message: error instanceof Error ? error.message : 'Manifiesto inválido.' }); return;
    }
    const generation = ++this.generation;
    this.patchState({ phase: ProfileImportPhase.Previewing, validity: PreviewValidity.Missing, previewManifest: null, message: '' });
    this.request = defer(() => this.importer.preview(manifest)).pipe(timeout(30_000)).subscribe({
      next: (result) => {
        if (!this.accepts(generation)) return;
        const review = this.previewStep.execute(manifest, result);
        const known = review.known;
        this.patchState({ review, phase: known ? ProfileImportPhase.Reviewing : ProfileImportPhase.Unknown, validity: !known ? PreviewValidity.Unknown : review.compatibility.allowsMerge ? PreviewValidity.Valid : PreviewValidity.Incompatible, previewManifest: known && review.compatibility.allowsMerge ? manifest : null, message: known ? '' : 'Respuesta no reconocida. No se puede aplicar el perfil.' });
      },
      error: (error: unknown) => this.fail(error, generation, false),
    });
  }
  reviewUncertainResult(): void {
    if (!this.hasAccess() || this.snapshot.phase !== ProfileImportPhase.ResultUncertain) return;
    this.patchState({ phase: ProfileImportPhase.Editing, validity: PreviewValidity.Stale, previewManifest: null, message: '' });
    this.previewProfile();
  }
  private accepts(generation: number): boolean { return this.hasAccess() && generation === this.generation; }
  get canConfirm(): boolean {
    return this.confirmationStep.allows(this.snapshot);
  }
  requestConfirmation(): void {
    if (this.hasAccess() && this.canConfirm) this.patchState({ phase: ProfileImportPhase.Confirming });
  }
  cancelConfirmation(): void {
    if (this.hasAccess() && this.snapshot.phase === ProfileImportPhase.Confirming) this.patchState({ phase: ProfileImportPhase.Reviewing });
  }
  mergeProfile(): void {
    if (!this.hasAccess() || this.snapshot.phase !== ProfileImportPhase.Confirming) return;
    this.patchState({ phase: ProfileImportPhase.Reviewing });
    if (!this.canConfirm) return;
    const manifest = this.snapshot.manifest;
    const generation = ++this.generation;
    this.patchState({ phase: ProfileImportPhase.Merging, previewManifest: null, validity: PreviewValidity.Stale, message: '' });
    this.request = defer(() => this.importer.merge(manifest)).pipe(timeout(30_000)).subscribe({
      next: (result) => {
        if (!this.accepts(generation)) return;
        const review = this.mergeResultStep.execute(this.snapshot.selection, result);
        const known = review !== null;
        this.patchState({ phase: known ? ProfileImportPhase.Succeeded : ProfileImportPhase.ResultUncertain, review: known ? review : null, message: known ? 'El servidor confirmó la aplicación de las secciones seleccionadas.' : 'El servidor respondió sin un resultado verificable. Comprobá el contenido antes de iniciar otra importación.' });
      },
      error: (error: unknown) => this.fail(error, generation, true),
    });
  }
  private fail(error: unknown, generation: number, merging: boolean): void {
    if (!this.accepts(generation)) return;
    const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status: unknown }).status : undefined;
    if (status === 401 || status === 403) { this.deny(); return; }
    const uncertain = merging && (
      status === undefined
      || status === 0
      || (typeof status === 'number' && status >= 200 && status < 300)
      || (typeof status === 'number' && status >= 500)
    );
    this.patchState({ phase: uncertain ? ProfileImportPhase.ResultUncertain : ProfileImportPhase.Failed, validity: PreviewValidity.Stale, previewManifest: null, message: uncertain ? 'La solicitud fue enviada, pero no recibimos una confirmación fiable. Comprobá el contenido del comercio antes de iniciar otra importación. No reintentamos automáticamente.' : 'No se pudo completar la operación. El borrador se conserva; revisalo y generá una nueva vista previa.' });
  }
  override ngOnDestroy(): void { this.generation++; this.request?.unsubscribe(); super.ngOnDestroy(); }
}
