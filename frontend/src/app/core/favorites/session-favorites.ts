/** Browser-only UI mock. Not an account wishlist and not an HTTP resource. */
export const FAVORITES_STORAGE_KEY = 'storecore.ui.favorites';

export interface BrowserFavorite {
  readonly sku: string;
  readonly name: string;
}

export interface FavoritesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readBrowserFavorites(storage: FavoritesStorage): BrowserFavorite[] {
  try {
    const raw = storage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeFavorites(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function writeBrowserFavorites(storage: FavoritesStorage, items: readonly BrowserFavorite[]): void {
  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalizeFavorites(items)));
}

export function toggleBrowserFavorite(items: readonly BrowserFavorite[], next: BrowserFavorite): BrowserFavorite[] {
  const current = normalizeFavorites(items);
  const sku = next.sku.trim();
  const name = next.name.trim();
  if (!sku || !name) {
    return current;
  }
  if (current.some((item) => item.sku === sku)) {
    return current.filter((item) => item.sku !== sku);
  }
  return [...current, { sku, name }];
}

function normalizeFavorites(value: unknown): BrowserFavorite[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: BrowserFavorite[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record['sku'] !== 'string' || typeof record['name'] !== 'string') {
      continue;
    }
    const sku = record['sku'].trim();
    const name = record['name'].trim();
    if (!sku || !name || seen.has(sku)) {
      continue;
    }
    seen.add(sku);
    items.push({ sku, name });
  }
  return items;
}
