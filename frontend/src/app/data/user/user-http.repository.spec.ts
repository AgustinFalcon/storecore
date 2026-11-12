import { BoundedPageRequest } from '../../domain/catalog/bounded-page';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { UserHttpRepository } from './user-http.repository';
import { mapProductDetail } from '../mappers/http-mappers';
import { ProductStatus, VariantStatus } from '../../domain/catalog/catalog-states';
import { catalogProductDraftFromDetail, newCatalogProductDraft } from '../../domain/catalog/catalog-product-draft';

describe('UserHttpRepository capabilities', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), UserHttpRepository],
  }));

  it('serializes explicit bounded pages for protected catalog and inventory reads', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    for (const [path, read] of [
      ['catalog', () => repository.listCatalog(BoundedPageRequest.at(2, 25))],
      ['inventory', () => repository.listInventory(BoundedPageRequest.at(2, 25))],
    ] as const) {
      const pending = firstValueFrom<unknown>(read());
      const request = http.expectOne(req => req.url === '/api/v1/user/' + path);
      expect(request.request.params.get('page')).toBe('2'); expect(request.request.params.get('size')).toBe('25');
      request.flush({ items: [], page: 2, size: 25, total: 0, truncated: false }); await pending;
    }
    http.verify();
  });

  it('posts profile manifest text unchanged for preview and merge', async () => {
    const repository = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const manifest = '{\n  "content": {"homeSections": []}\n}';
    for (const [url, execute] of [
      ['/api/v1/user/profiles/preview', () => repository.previewProfile(manifest)],
      ['/api/v1/user/profiles/merge', () => repository.mergeProfile(manifest)],
    ] as const) {
      const pending = firstValueFrom(execute()); const request = http.expectOne(url);
      expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ manifest });
      request.flush({ compatible: true, version: '1.0.0', diff: '[]' }); await expect(pending).resolves.toMatchObject({ compatible: true });
    }
    http.verify();
  });

  it('exposes capabilities through the GET contract only', async () => {
    const repository = TestBed.inject(UserHttpRepository);
    const http = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repository.listCapabilities());
    const request = http.expectOne('/api/v1/user/capabilities');
    expect(request.request.method).toBe('GET');
    request.flush([{ module: 'CATALOG', state: 'ACTIVE', configVersion: 3 }]);
    await expect(pending).resolves.toEqual([
      { id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Active, configVersion: 3 },
    ]);
    http.verify();
  });

  it('serializes closed catalog states without degrading archived products or inactive variants', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    const wire = { id: 'p', sku: 'SKU', name: 'Producto', status: ProductStatus.Archived.wire, price: { base: 25, original: 25, effective: 25, offer: null },
      variants: [{ id: 'v', sku: 'VAR', name: 'Variante', status: VariantStatus.Inactive.wire, availability: 'UNAVAILABLE', attributes: { Material: 'Acero', Color: 'Negro' }, inventory: { sku: 'VAR', state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null } }] };
    const pending = firstValueFrom(repository.saveProduct(catalogProductDraftFromDetail(mapProductDetail(wire))));
    const request = http.expectOne('/api/v1/user/catalog/products/SKU');
    expect(request.request.body.status).toBe(ProductStatus.Archived.wire);
    expect(request.request.body.variants[0]).toEqual({ id: 'v', sku: 'VAR', name: 'Variante', status: VariantStatus.Inactive.wire, attributes: wire.variants[0].attributes });
    expect(request.request.body).not.toHaveProperty('active');
    expect(request.request.body.variants[0]).not.toHaveProperty('active');
    expect(request.request.body.price).toEqual({ base: 25 });
    expect(request.request.body.variants[0]).not.toHaveProperty('availableQuantity');
    request.flush(wire); expect((await pending).status).toBe(ProductStatus.Archived); http.verify();
  });

  it('sends initial stock only for a new catalog variant', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    const draft = newCatalogProductDraft();
    const pending = firstValueFrom(repository.saveProduct({ ...draft, sku: 'NEW-1', name: 'Nuevo', variants: [{ ...draft.variants[0], sku: 'NEW-1', name: 'Principal', initialAvailableQuantity: 7 }] }));
    const request = http.expectOne('/api/v1/user/catalog/products/NEW-1');
    expect(request.request.body.variants[0]).toEqual(expect.objectContaining({ sku: 'NEW-1', availableQuantity: 7 }));
    request.flush({ id: 'p', sku: 'NEW-1', name: 'Nuevo', status: 'DRAFT', price: { base: 0, original: 0, effective: 0, offer: null }, variants: [{ id: 'v', sku: 'NEW-1', name: 'Principal', status: 'ACTIVE', availability: 'AVAILABLE', attributes: {}, inventory: { sku: 'NEW-1', state: 'KNOWN', available: 7, reserved: 0, safety: 0, onHand: 7, saleable: 7 } }] });
    await pending; http.verify();
  });
});
