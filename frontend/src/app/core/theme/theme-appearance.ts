import { Injectable } from '@angular/core';

/** Header chrome. Onboarding/config later sets this; never hardcode a merchant color. */
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
    const root = document.documentElement;
    root.style.setProperty('--sc-color-theme', tokens.theme);
    root.style.setProperty('--sc-color-theme-ink', tokens.themeInk);
  }
}
