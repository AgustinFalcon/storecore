const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const ENCODED_DANGEROUS_OCTET = /%(0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i;

function uuid(raw: unknown): string | null {
  return typeof raw === 'string' && UUID.test(raw) ? raw : null;
}

export class MediaAssetId {
  private constructor(readonly value: string) {}
  static fromWire(raw: unknown): MediaAssetId | null { const value = uuid(raw); return value ? new MediaAssetId(value) : null; }
}
export class CatalogMediaDraftId {
  private constructor(readonly value: string) {}
  static fromWire(raw: unknown): CatalogMediaDraftId | null { const value = uuid(raw); return value ? new CatalogMediaDraftId(value) : null; }
}
export class UploadId {
  private constructor(readonly value: string) {}
  static fromWire(raw: unknown): UploadId | null { const value = uuid(raw); return value ? new UploadId(value) : null; }
}
export class ContentDigest {
  private constructor(readonly value: string) {}
  static fromWire(raw: unknown): ContentDigest | null { return typeof raw === 'string' && SHA256.test(raw) ? new ContentDigest(raw) : null; }
}
export class PixelDimensions {
  private constructor(readonly width: number, readonly height: number) {}
  get pixels(): number { return this.width * this.height; }
  static fromWire(width: unknown, height: unknown): PixelDimensions | null {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return null;
    const value = new PixelDimensions(width as number, height as number);
    return value.width >= 320 && value.width <= 6000 && value.height >= 320 && value.height <= 6000 && value.pixels <= 16_000_000 ? value : null;
  }
}
export class AltText {
  private constructor(readonly value: string) {}
  static fromWire(raw: unknown): AltText | null {
    if (typeof raw !== 'string' || raw !== raw.trim() || [...raw].length < 1 || [...raw].length > 180 || CONTROL_OR_FORMAT.test(raw)) return null;
    return new AltText(raw);
  }
}

function unsafeDecodedPart(raw: string): boolean {
  try {
    const decoded = decodeURIComponent(raw);
    return CONTROL_OR_FORMAT.test(decoded) || decoded.includes('\\') || decoded.split('/').some(segment => segment === '.' || segment === '..');
  } catch { return true; }
}

export class PublicMediaUrl {
  private constructor(readonly value: string) {}
  static fromWire(raw: unknown, allowedHosts: ReadonlySet<string>): PublicMediaUrl | null {
    if (typeof raw !== 'string' || raw.length < 1 || raw.length > 2048 || raw.includes('\\') || raw.includes('#')
      || [...raw].some(char => /[\p{Cc}\p{White_Space}]/u.test(char)) || ENCODED_DANGEROUS_OCTET.test(raw)) return null;
    try {
      const shape = /^https:\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/i.exec(raw);
      const authority = shape?.[1];
      if (!authority || authority.includes('@') || authority.includes('%')) return null;
      const rawPath = shape?.[2] ?? '/';
      if (unsafeDecodedPart(rawPath)) return null;
      const parsed = new URL(raw);
      const allowed = new Set([...allowedHosts].map(host => host.toLowerCase()));
      if (parsed.protocol !== 'https:' || !allowed.has(parsed.hostname.toLowerCase()) || parsed.username || parsed.password || parsed.hash
        || unsafeDecodedPart(parsed.pathname) || unsafeDecodedPart(parsed.search)) return null;
      parsed.protocol = 'https:';
      parsed.hostname = parsed.hostname.toLowerCase();
      if (parsed.port === '443') parsed.port = '';
      return new PublicMediaUrl(parsed.href);
    } catch { return null; }
  }
}

export class ManagedMediaPath {
  private constructor(readonly value: string) {}
  static fromProductImageId(raw: unknown): ManagedMediaPath | null {
    return Number.isSafeInteger(raw) && (raw as number) > 0 ? new ManagedMediaPath(`/api/v1/catalog/media/${raw as number}`) : null;
  }
}
