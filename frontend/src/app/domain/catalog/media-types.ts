function exact<T>(raw: unknown, values: readonly T[], wire: (value: T) => string): T | undefined {
  return typeof raw === 'string' ? values.find(value => wire(value) === raw) : undefined;
}

export class MediaAssetState {
  private constructor(readonly wire: string, readonly label: string, readonly known = true) {}
  static readonly AwaitingBytes = new MediaAssetState('AWAITING_BYTES', 'Esperando archivo');
  static readonly StoredPrivate = new MediaAssetState('STORED_PRIVATE', 'Archivo privado listo');
  static readonly Attached = new MediaAssetState('ATTACHED', 'Asociada al catálogo');
  static readonly DeletePending = new MediaAssetState('DELETE_PENDING', 'Eliminación pendiente');
  static readonly Deleted = new MediaAssetState('DELETED', 'Eliminada');
  static readonly Failed = new MediaAssetState('FAILED', 'Falló el procesamiento');
  static readonly Unknown = new MediaAssetState('UNKNOWN', 'Estado desconocido', false);
  static readonly values = [this.AwaitingBytes, this.StoredPrivate, this.Attached, this.DeletePending, this.Deleted, this.Failed] as const;
  static fromWire(raw: unknown): MediaAssetState { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}

export class MediaFormat {
  private constructor(readonly wire: string, readonly mime: string, readonly known = true) {}
  static readonly Jpeg = new MediaFormat('JPEG', 'image/jpeg');
  static readonly Png = new MediaFormat('PNG', 'image/png');
  static readonly Webp = new MediaFormat('WEBP', 'image/webp');
  static readonly Unknown = new MediaFormat('UNKNOWN', 'application/octet-stream', false);
  static readonly values = [this.Jpeg, this.Png, this.Webp] as const;
  static fromWire(raw: unknown): MediaFormat { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}

export class MediaProviderKind {
  private constructor(readonly wire: string, readonly available: boolean, readonly known = true) {}
  static readonly Unconfigured = new MediaProviderKind('UNCONFIGURED', false);
  static readonly TestStub = new MediaProviderKind('TEST_STUB', true);
  static readonly Cloudinary = new MediaProviderKind('CLOUDINARY', true);
  static readonly Unknown = new MediaProviderKind('UNKNOWN', false, false);
  static readonly values = [this.Unconfigured, this.TestStub, this.Cloudinary] as const;
  static fromWire(raw: unknown): MediaProviderKind { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}

export class MediaAssociationKind {
  private constructor(readonly wire: string, readonly label: string, readonly known = true) {}
  static readonly ProductGallery = new MediaAssociationKind('PRODUCT_GALLERY', 'Galería general');
  static readonly VariantGallery = new MediaAssociationKind('VARIANT_GALLERY', 'Galería de variante');
  static readonly Unknown = new MediaAssociationKind('UNKNOWN', 'Asociación desconocida', false);
  static readonly values = [this.ProductGallery, this.VariantGallery] as const;
  static fromWire(raw: unknown): MediaAssociationKind { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}

export class LegacyMediaState {
  private constructor(readonly wire: string, readonly publishable: boolean, readonly known = true) {}
  static readonly Allowed = new LegacyMediaState('ALLOWED', true);
  static readonly Blocked = new LegacyMediaState('BLOCKED', false);
  static readonly Unknown = new LegacyMediaState('UNKNOWN', false, false);
  static readonly values = [this.Allowed, this.Blocked] as const;
  static fromWire(raw: unknown): LegacyMediaState { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}

export class MediaUploadOutcome {
  private constructor(readonly wire: string, readonly successful: boolean, readonly known = true) {}
  static readonly Created = new MediaUploadOutcome('CREATED', true);
  static readonly Replay = new MediaUploadOutcome('REPLAY', true);
  static readonly Rejected = new MediaUploadOutcome('REJECTED', false);
  static readonly Conflict = new MediaUploadOutcome('CONFLICT', false);
  static readonly Failed = new MediaUploadOutcome('FAILED', false);
  static readonly Unknown = new MediaUploadOutcome('UNKNOWN', false, false);
  static readonly values = [this.Created, this.Replay, this.Rejected, this.Conflict, this.Failed] as const;
  static fromWire(raw: unknown): MediaUploadOutcome { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}

export class MediaCommandState {
  private constructor(readonly wire: string, readonly terminal: boolean, readonly known = true) {}
  static readonly AwaitingBytes = new MediaCommandState('AWAITING_BYTES', false);
  static readonly Claimed = new MediaCommandState('CLAIMED', false);
  static readonly StoredPrivate = new MediaCommandState('STORED_PRIVATE', false);
  static readonly Attached = new MediaCommandState('ATTACHED', false);
  static readonly DeletePending = new MediaCommandState('DELETE_PENDING', false);
  static readonly Completed = new MediaCommandState('COMPLETED', true);
  static readonly Failed = new MediaCommandState('FAILED', true);
  static readonly Unknown = new MediaCommandState('UNKNOWN', true, false);
  static readonly values = [this.AwaitingBytes, this.Claimed, this.StoredPrivate, this.Attached, this.DeletePending, this.Completed, this.Failed] as const;
  static fromWire(raw: unknown): MediaCommandState { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}

export class MediaFailureCode {
  private constructor(readonly wire: string, readonly retryable: boolean, readonly known = true) {}
  static readonly None = new MediaFailureCode('NONE', false);
  static readonly Unauthorised = new MediaFailureCode('UNAUTHORISED', false);
  static readonly InvalidFormat = new MediaFailureCode('INVALID_FORMAT', false);
  static readonly InvalidDimensions = new MediaFailureCode('INVALID_DIMENSIONS', false);
  static readonly SizeExceeded = new MediaFailureCode('SIZE_EXCEEDED', false);
  static readonly CorruptBytes = new MediaFailureCode('CORRUPT_BYTES', false);
  static readonly AnimatedMedia = new MediaFailureCode('ANIMATED_MEDIA', false);
  static readonly StorageUnavailable = new MediaFailureCode('STORAGE_UNAVAILABLE', true);
  static readonly ScopeConflict = new MediaFailureCode('SCOPE_CONFLICT', false);
  static readonly Unknown = new MediaFailureCode('UNKNOWN', false, false);
  static readonly values = [this.None, this.Unauthorised, this.InvalidFormat, this.InvalidDimensions, this.SizeExceeded,
    this.CorruptBytes, this.AnimatedMedia, this.StorageUnavailable, this.ScopeConflict] as const;
  static fromWire(raw: unknown): MediaFailureCode { return exact(raw, this.values, value => value.wire) ?? this.Unknown; }
}
