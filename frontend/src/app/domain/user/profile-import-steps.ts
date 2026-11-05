import { ProfileCompatibility, ProfileImportPhase, PreviewValidity, ProfileManifestDraft, ProfileReview, ProfileReviewDecoder } from './profile-import';
import { ProfilePreview } from './user.entity';

export interface ProfileConfirmationContext {
  readonly phase: ProfileImportPhase;
  readonly validity: PreviewValidity;
  readonly manifest: string;
  readonly previewManifest: string | null;
  readonly review: ProfileReview | null;
  readonly selection: readonly string[];
}

/** Each workflow step owns one decision; the store orders them and owns transport lifecycle. */
export class ProfileSelectionStep {
  constructor(private readonly draft = new ProfileManifestDraft()) {}
  execute(manifest: string, selection: readonly string[]): string { return this.draft.select(manifest, selection); }
}

export class ProfilePreviewStep {
  constructor(private readonly draft = new ProfileManifestDraft(), private readonly decoder = new ProfileReviewDecoder()) {}
  execute(manifest: string, response: ProfilePreview): ProfileReview {
    const review = this.decoder.decode(response);
    const keys = this.draft.keys(manifest);
    if (review.known && review.changes.length === keys.length && review.changes.every((row) => keys.includes(row.sectionKey))) return review;
    return { compatibility: ProfileCompatibility.Unknown, known: false, version: '', changes: [] };
  }
}

export class ProfileConfirmationStep {
  allows(context: ProfileConfirmationContext): boolean {
    return context.phase === ProfileImportPhase.Reviewing && context.validity === PreviewValidity.Valid && context.previewManifest === context.manifest && context.selection.length > 0 && context.review?.known === true && context.review.compatibility.allowsMerge;
  }
}

export class ProfileMergeResultStep {
  constructor(private readonly decoder = new ProfileReviewDecoder()) {}
  execute(selection: readonly string[], response: ProfilePreview): ProfileReview | null {
    const review = this.decoder.decode(response);
    return review.known && review.compatibility.allowsMerge && selection.length === review.changes.length && review.changes.every((row) => selection.includes(row.sectionKey)) ? review : null;
  }
}
