import { computed, Injectable, signal } from '@angular/core';

/**
 * Favoritos de chrome (sesión del browser). No es contrato HTTP.
 * Persistencia de servidor queda diferida.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesMemory {
  private readonly key = 'sc-favorites';
  private readonly skus = signal<readonly string[]>(this.read());

  readonly count = computed(() => this.skus().length);

  has(sku: string): boolean {
    return this.skus().includes(sku);
  }

  toggle(sku: string): void {
    if (!sku) {
      return;
    }
    const next = this.has(sku) ? this.skus().filter((id) => id !== sku) : [...this.skus(), sku];
    this.skus.set(next);
    this.write(next);
  }

  private read(): readonly string[] {
    try {
      const raw = sessionStorage.getItem(this.key);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private write(skus: readonly string[]): void {
    try {
      sessionStorage.setItem(this.key, JSON.stringify(skus));
    } catch {
      /* ignore quota */
    }
  }
}
