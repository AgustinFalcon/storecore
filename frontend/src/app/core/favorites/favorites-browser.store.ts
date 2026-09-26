import { Injectable, computed, signal } from '@angular/core';
import {
  BrowserFavorite,
  FAVORITES_STORAGE_KEY,
  FavoritesStorage,
  readBrowserFavorites,
  toggleBrowserFavorite,
  writeBrowserFavorites,
} from './session-favorites';

/** In-tab UI state. sessionStorage of this browser only; no HTTP and no account sync. */
@Injectable({ providedIn: 'root' })
export class FavoritesBrowserStore {
  private readonly storage = browserFavoritesStorage();
  private readonly items = signal<readonly BrowserFavorite[]>(readBrowserFavorites(this.storage));
  readonly list = this.items.asReadonly();
  readonly ids = computed(() => this.list().map((item) => item.sku));

  toggle(item: BrowserFavorite): void {
    const next = toggleBrowserFavorite(this.items(), item);
    try {
      writeBrowserFavorites(this.storage, next);
    } catch {
      // The heart still flips in this tab when the browser refuses the write.
    }
    this.items.set(next);
  }
}

const memory = new Map<string, string>();

const memoryStorage: FavoritesStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

function browserFavoritesStorage(): FavoritesStorage {
  try {
    if (typeof sessionStorage === 'undefined') {
      return memoryStorage;
    }
    sessionStorage.getItem(FAVORITES_STORAGE_KEY);
    return sessionStorage;
  } catch {
    return memoryStorage;
  }
}
