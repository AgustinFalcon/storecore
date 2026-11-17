import { BoundedPageRequest } from '../../domain/catalog/bounded-page';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityStateIntent } from '../../domain/user/capability-state-intent';
import { ChangeCapabilityStateUseCase } from '../../domain/user/use-cases/change-capability-state.usecase';
import { UserHttpRepository } from './user-http.repository';
import { mapProductDetail } from '../mappers/http-mappers';
import { ProductStatus, VariantStatus } from '../../domain/catalog/catalog-states';
import { catalogProductDraftFromDetail, newCatalogProductDraft } from '../../domain/catalog/catalog-product-draft';
import { emptyCatalogQuery } from '../../domain/catalog/catalog-query.entity';

describe('UserHttpRepository capabilities', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), UserHttpRepository],
  }));

  const intent = () => CapabilityStateIntent.create({ id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Disabled, configVersion: 3 },
    CapabilityModuleState.Active, '  autorización  ', () => '10000000-0000-4000-8000-000000000001')!;
  it('sends the exact typed state command and maps the authoritative server version', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(new ChangeCapabilityStateUseCase(repository).execute(intent()));
    const request = http.expectOne('/api/v1/user/capabilities/CATALOG/state');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ state: CapabilityModuleState.Active.wire,
      expectedConfigVersion: 3, reason: 'autorización', correlationId: intent().correlationId });
    request.flush({ module: CapabilityModuleId.Catalog.wire, state: CapabilityModuleState.Active.wire, configVersion: 4 });
    await expect(pending).resolves.toEqual({ id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Active, configVersion: 4 }); http.verify();
  });
  it.each([null, {}, { module: 'FAVORITES', state: 'ACTIVE', configVersion: 4 },
    { module: 'CATALOG', state: 'future', configVersion: 4 }, { module: 'CATALOG', state: 'ACTIVE', configVersion: null },
    { module: 'CATALOG', state: 'ACTIVE', configVersion: 3 }, { module: 'CATALOG', state: 'ACTIVE', configVersion: 5 }])('rejects unusable or mismatched command responses', async response => {
    const http = TestBed.inject(HttpTestingController); const pending = firstValueFrom(TestBed.inject(UserHttpRepository).changeCapabilityState(intent()));
    const assertion = expect(pending).rejects.toThrow();
    http.expectOne('/api/v1/user/capabilities/CATALOG/state').flush(response); await assertion; http.verify();
  });
  it('expires a command after a finite deadline without retrying it', async () => {
    vi.useFakeTimers();
    try {
      const http = TestBed.inject(HttpTestingController); const pending = firstValueFrom(TestBed.inject(UserHttpRepository).changeCapabilityState(intent()));
      const assertion = expect(pending).rejects.toThrow(); const request = http.expectOne('/api/v1/user/capabilities/CATALOG/state');
      await vi.advanceTimersByTimeAsync(15001); await assertion;
      expect(request.cancelled).toBe(true); http.verify();
    } finally { vi.useRealTimers(); }
  });

  it('serializes explicit bounded pages for protected catalog and inventory reads', async () => {
    const repository = TestBed.inject(UserHttpRepository); const http = TestBed.inject(HttpTestingController);
    for (const [path, read] of [
      ['catalog', () => repository.listCatalog({ ...emptyCatalogQuery, query: 'taladro', brand: '3', category: '7', offersOnly: true, pagination: BoundedPageRequest.at(2, 25) })],
      ['inventory', () => repository.listInventory(BoundedPageRequest.at(2, 25))],
    ] as const) {
      const pending = firstValueFrom<unknown>(read());
      const request = http.expectOne(req => req.url === '/api/v1/user/' + path);
      expect(request.request.params.get('page')).toBe('2'); expect(request.request.params.get('size')).toBe('25');
      if (path === 'catalog') {
        expect(request.request.params.get('query')).toBe('taladro'); expect(request.request.params.get('brand')).toBe('3');
        expect(request.request.params.get('category')).toBe('7'); expect(request.request.params.get('offers')).toBe('true');
      }
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
    const wire = { id: 'p', sku: 'SKU', name: 'Producto', status: ProductStatus.Archived.wire, productBasePrice: 25, price: { base: 25, original: 25, effective: 25, offer: null },
      variants: [{ id: 'v', sku: 'VAR', name: 'Variante', status: VariantStatus.Inactive.wire, availability: 'UNAVAILABLE', attributes: { Material: 'Acero', Color: 'Negro' }, inventory: { sku: 'VAR', state: 'MISSING', available: null, reserved: null, safety: null, onHand: null, saleable: null } }] };
    const pending = firstValueFrom(repository.saveProduct(catalogProductDraftFromDetail(mapProductDetail(wire))));
    const request = http.expectOne('/api/v1/user/catalog/products/SKU');
    expect(request.request.body.status).toBe(ProductStatus.Archived.wire);
    expect(request.request.body.variants[0]).toEqual({ id: 'v', sku: 'VAR', name: 'Variante', status: VariantStatus.Inactive.wire, attributes: wire.variants[0].attributes, priceCommand: { mode: 'PRESERVE' } });
    expect(request.request.body).not.toHaveProperty('active');
    expect(request.request.body.variants[0]).not.toHaveProperty('active');
    expect(request.request.body.productBasePrice).toBe(25);
    expect(request.request.body).not.toHaveProperty('price');
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
