/** Only validated values may become merchant-controlled CSS tokens. */
export class BrandColor {
  private constructor(readonly value: string, readonly known = true) {}
  static readonly Unknown = new BrandColor('', false);
  static fromWire(raw: unknown): BrandColor {
    return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? new BrandColor(raw.toLowerCase()) : this.Unknown;
  }
  private get luminance(): number {
    const c = [1, 3, 5].map(i => parseInt(this.value.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  }
  contrast(other: BrandColor): number {
    if (!this.known || !other.known) return 0;
    return (Math.max(this.luminance, other.luminance) + 0.05) / (Math.min(this.luminance, other.luminance) + 0.05);
  }
}
export class BrandLogoKind {
  private constructor(readonly external: boolean, readonly known: boolean) {}
  static readonly None = new BrandLogoKind(false, true);
  static readonly RootRelative = new BrandLogoKind(false, true);
  static readonly Https = new BrandLogoKind(true, true);
  static readonly Unknown = new BrandLogoKind(false, false);
}
export class BrandingAuthorityError extends Error {
  constructor() { super('La apariencia recibida es inválida. Recargá antes de publicar.'); }
}
const FORBIDDEN_ENCODED_LOGO_OCTET = /%(0[0-9a-f]|1[0-9a-f]|7f|5c|2f)/i;
const FORBIDDEN_NAME_CODE_POINT = /[\p{Cc}\p{Cf}]/u;
const VISIBLE_NAME_CODE_POINT = /\P{White_Space}/u;

function safeDecodedUrlPart(value: string): string | null {
  try { return decodeURIComponent(value); } catch { return null; }
}

function hasUnsafeDecodedUrlPart(value: string): boolean {
  const decoded = safeDecodedUrlPart(value);
  return decoded === null || [...decoded].some(char => /\p{Cc}/u.test(char) || char === String.fromCharCode(92));
}

function validBusinessName(name: string): boolean {
  const codePoints = [...name];
  return name === name.trim() && codePoints.length >= 2 && codePoints.length <= 160
    && codePoints.filter(char => VISIBLE_NAME_CODE_POINT.test(char)).length >= 2
    && !codePoints.some(char => FORBIDDEN_NAME_CODE_POINT.test(char));
}

export class BrandLogo {
  private constructor(readonly url: string | null, readonly kind: BrandLogoKind) {}
  get external(): boolean { return this.kind.external; }
  get known(): boolean { return this.kind.known; }
  static readonly None = new BrandLogo(null, BrandLogoKind.None);
  static readonly Unknown = new BrandLogo(null, BrandLogoKind.Unknown);
  static fromWire(raw: unknown): BrandLogo {
    if (raw === null || raw === '') return this.None;
    if (typeof raw !== 'string' || raw.length > 2048 || raw.includes('#') || FORBIDDEN_ENCODED_LOGO_OCTET.test(raw)
      || /^https:\/\/[^/?#]*@/i.test(raw) || [...raw].some(c => /\p{Cc}|\p{White_Space}/u.test(c) || c === String.fromCharCode(92))) return this.Unknown;
    if (raw.startsWith('/assets/')) {
      try {
        const url = new URL(raw, 'https://branding.invalid');
        const canonical = url.pathname + url.search;
        return canonical.length <= 2048 && url.pathname.startsWith('/assets/') && !url.hash
          && !hasUnsafeDecodedUrlPart(url.pathname) && !hasUnsafeDecodedUrlPart(url.search)
          && !safeDecodedUrlPart(url.pathname)?.split('/').some(segment => segment === '.' || segment === '..')
          ? new BrandLogo(canonical, BrandLogoKind.RootRelative) : this.Unknown;
      } catch { return this.Unknown; }
    }
    if (!/^https:\/\/[^/]/i.test(raw)) return this.Unknown;
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hash
        && url.href.length <= 2048 && !hasUnsafeDecodedUrlPart(url.pathname) && !hasUnsafeDecodedUrlPart(url.search)
        && !safeDecodedUrlPart(url.pathname)?.split('/').some(segment => segment === '.' || segment === '..')
        ? new BrandLogo(url.href, BrandLogoKind.Https) : this.Unknown;
    } catch { return this.Unknown; }
  }
}
export interface BrandingDraft {
  readonly businessName: string;
  readonly logoUrl: string;
  readonly primaryColor: string;
  readonly onPrimaryColor: string;
}
export class MerchantBranding {
  private constructor(readonly revision: number, readonly businessName: string, readonly logo: BrandLogo,
    readonly primary: BrandColor, readonly onPrimary: BrandColor) {}
  static readonly Default = new MerchantBranding(0, 'StoreCore', BrandLogo.None, BrandColor.fromWire('#0f172a'), BrandColor.fromWire('#f8fafc'));
  static fromWire(raw: unknown): MerchantBranding | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    const name = value['businessName'];
    const logo = BrandLogo.fromWire(value['logoUrl']);
    const primary = BrandColor.fromWire(value['primaryColor']);
    const ink = BrandColor.fromWire(value['onPrimaryColor']);
    if (!Number.isSafeInteger(value['revision']) || (value['revision'] as number) <= 0 || typeof name !== 'string'
      || !validBusinessName(name)
      || !logo.known || primary.contrast(ink) < 4.5) return null;
    return new MerchantBranding(value['revision'] as number, name, logo, primary, ink);
  }
  draft(): BrandingDraft { return { businessName: this.businessName, logoUrl: this.logo.url ?? '', primaryColor: this.primary.value, onPrimaryColor: this.onPrimary.value }; }
  static validateDraft(draft: BrandingDraft, revision: number): MerchantBranding | null {
    return this.fromWire({ ...draft, businessName: draft.businessName.trim(), revision });
  }
}
export class BrandingPhase {
  private constructor(readonly label: string, readonly busy = false) {}
  static readonly AccessDenied = new BrandingPhase('Acceso exclusivo para administradores');
  static readonly Loading = new BrandingPhase('Cargando apariencia', true);
  static readonly Clean = new BrandingPhase('Apariencia publicada');
  static readonly Editing = new BrandingPhase('Cambios sin publicar');
  static readonly Saving = new BrandingPhase('Publicando apariencia', true);
  static readonly Success = new BrandingPhase('Apariencia publicada correctamente');
  static readonly Conflict = new BrandingPhase('Otra persona publicó cambios');
  static readonly Error = new BrandingPhase('No pudimos completar la operación');
  static readonly Invalid = new BrandingPhase('Revisá los campos');
}
