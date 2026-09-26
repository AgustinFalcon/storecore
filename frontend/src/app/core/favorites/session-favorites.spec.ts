import {
  BrowserFavorite,
  FAVORITES_STORAGE_KEY,
  FavoritesStorage,
  readBrowserFavorites,
  toggleBrowserFavorite,
  writeBrowserFavorites,
} from './session-favorites';

class MemoryStorage implements FavoritesStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('session favorites', () => {
  it('reads an empty list when the key is missing', () => {
    expect(readBrowserFavorites(new MemoryStorage())).toEqual([]);
  });

  it('stores only sku and name under storecore.ui.favorites', () => {
    const storage = new MemoryStorage();
    const withPrice = [{ sku: ' from-catalog ', name: ' From catalog ', price: 10 }] as unknown as BrowserFavorite[];

    writeBrowserFavorites(storage, withPrice);

    expect(storage.getItem(FAVORITES_STORAGE_KEY)).toBe('[{"sku":"from-catalog","name":"From catalog"}]');
    expect(readBrowserFavorites(storage)).toEqual([{ sku: 'from-catalog', name: 'From catalog' }]);
  });

  it('toggles the same sku on and off without keeping a price', () => {
    const added = toggleBrowserFavorite([], { sku: 'a', name: 'A' });
    expect(added).toEqual([{ sku: 'a', name: 'A' }]);
    expect(toggleBrowserFavorite(added, { sku: 'a', name: 'A' })).toEqual([]);
  });

  it('drops corrupt payloads, blanks and duplicate skus', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify([
        { sku: 'keep', name: 'Keep' },
        { sku: 'keep', name: 'Again' },
        { sku: '  ', name: 'Blank' },
        { sku: 'no-name', name: '   ' },
        { sku: 1, name: 'Number' },
        null,
        { name: 'Missing sku' },
      ]),
    );
    expect(readBrowserFavorites(storage)).toEqual([{ sku: 'keep', name: 'Keep' }]);

    storage.setItem(FAVORITES_STORAGE_KEY, '{');
    expect(readBrowserFavorites(storage)).toEqual([]);

    storage.setItem(FAVORITES_STORAGE_KEY, '{"sku":"a"}');
    expect(readBrowserFavorites(storage)).toEqual([]);
  });

  it('returns an empty list when storage throws', () => {
    const storage: FavoritesStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(readBrowserFavorites(storage)).toEqual([]);
  });

  it('ignores a toggle that has no sku or name', () => {
    const current = [{ sku: 'a', name: 'A' }];
    expect(toggleBrowserFavorite(current, { sku: ' ', name: 'B' })).toEqual(current);
    expect(toggleBrowserFavorite(current, { sku: 'b', name: ' ' })).toEqual(current);
  });
});
