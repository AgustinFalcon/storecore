import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CatalogHttpRepository } from './catalog-http.repository';

describe('CatalogHttpRepository', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CatalogHttpRepository],
    });
  });

  it('omits empty catalog filters', async () => {
    const repo = TestBed.inject(CatalogHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.search({ query: '', brand: '', category: '', offersOnly: false }));
    const req = ctrl.expectOne('/api/v1/catalog');
    expect(req.request.params.keys().length).toBe(0);
    req.flush([{ sku: 'SKU-1', name: 'Lámpara', price: 10 }]);
    await expect(pending).resolves.toEqual([{ sku: 'SKU-1', name: 'Lámpara', price: 10 }]);
  });

  it('sends only filled filters and offers', async () => {
    const repo = TestBed.inject(CatalogHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(
      repo.search({ query: 'lamp', brand: 'casa', category: 'luz', offersOnly: true }),
    );
    const req = ctrl.expectOne((r) => r.url === '/api/v1/catalog');
    expect(req.request.params.get('query')).toBe('lamp');
    expect(req.request.params.get('brand')).toBe('casa');
    expect(req.request.params.get('category')).toBe('luz');
    expect(req.request.params.get('offers')).toBe('true');
    req.flush([]);
    await pending;
  });
});
