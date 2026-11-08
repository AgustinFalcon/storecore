import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { UserHttpRepository } from './user-http.repository';
import { mapProductDetail } from '../mappers/http-mappers';
import { ProductStatus, VariantStatus } from '../../domain/catalog/catalog-states';

describe('UserHttpRepository capabilities', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), UserHttpRepository],
  }));

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
    const pending = firstValueFrom(repository.saveProduct(mapProductDetail(wire)));
    const request = http.expectOne('/api/v1/user/catalog/products/SKU');
    expect(request.request.body.status).toBe(ProductStatus.Archived.wire);
    expect(request.request.body.variants[0]).toEqual({ id: 'v', sku: 'VAR', name: 'Variante', status: VariantStatus.Inactive.wire, attributes: wire.variants[0].attributes });
    expect(request.request.body).not.toHaveProperty('active');
    expect(request.request.body.variants[0]).not.toHaveProperty('active');
    expect(request.request.body.price).toEqual({ base: 25 });
    expect(request.request.body.variants[0]).not.toHaveProperty('availableQuantity');
    request.flush(wire); expect((await pending).status).toBe(ProductStatus.Archived); http.verify();
  });
});
