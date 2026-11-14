import { BrandColor } from '../../domain/branding/merchant-branding';
import { Injectable } from '@angular/core';

/** Only the validated merchant pair is applied; semantic tokens stay independent. */
export interface ThemeAppearanceTokens {
  readonly theme: string;
  readonly themeInk: string;
}

export const DEFAULT_THEME: ThemeAppearanceTokens = {
  theme: '#0f172a',
  themeInk: '#f8fafc',
};

@Injectable({ providedIn: 'root' })
export class ThemeAppearance {
  apply(tokens: ThemeAppearanceTokens = DEFAULT_THEME): void {
    const primary = BrandColor.fromWire(tokens.theme);
    const ink = BrandColor.fromWire(tokens.themeInk);
    if (primary.contrast(ink) < 4.5) tokens = DEFAULT_THEME;
    const root = document.documentElement;
    root.style.setProperty('--sc-color-theme', tokens.theme);
    root.style.setProperty('--sc-color-theme-ink', tokens.themeInk);
  }
}
