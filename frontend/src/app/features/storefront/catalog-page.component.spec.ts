import { DestroyRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BoundedPageRequest } from '../../domain/catalog/bounded-page';
import { CatalogStore } from './catalog.store';
import { CatalogPageComponent } from './catalog-page.component';

describe('CatalogPageComponent route application', () => {
  const query = {
    query: '', brand: '', category: '', offersOnly: false,
    pagination: BoundedPageRequest.first(),
  };

  function setup(navigated: boolean) {
    const store = {
      snapshot: { query },
      search: vi.fn(),
      setQuery: vi.fn(),
    };
    const router = { navigate: vi.fn().mockResolvedValue(navigated) };
    const component = new CatalogPageComponent(
      store as unknown as CatalogStore,
      {} as ActivatedRoute,
      router as unknown as Router,
      {} as DestroyRef,
    );
    return { component, router, store };
  }

  it('searches explicitly when Angular skips navigation to the current filter URL', async () => {
    const { component, router, store } = setup(false);
    component.applyFilters();
    await Promise.resolve();
    expect(router.navigate).toHaveBeenCalledOnce();
    expect(store.search).toHaveBeenCalledOnce();
  });

  it('lets the reactive route perform the search after a real URL change', async () => {
    const { component, store } = setup(true);
    component.applyFilters();
    await Promise.resolve();
    expect(store.search).not.toHaveBeenCalled();
  });

  it('restores an already unfiltered catalog when clearing the same URL', async () => {
    const { component, store } = setup(false);
    component.clearFilters();
    await Promise.resolve();
    expect(store.setQuery).toHaveBeenCalledWith(query);
    expect(store.search).toHaveBeenCalledOnce();
  });
});
