import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminProductOptionsMapper, optionCommand, optionDraft } from '../../domain/catalog/admin-product-options';
import { ProductOptionsHttpRepository } from './product-options-http.repository';

const wire = { revision: 2, state: 'VALID', cause: null, axes: [{ code: 'size', label: 'Tamaño', presentation: 'SELECT', order: 0,
  values: [{ code: 'm', label: 'M', order: 0, swatchColor: null }] }], assignments: [{ variantId: '42', variantSku: 'SKU/M', active: true, optionValues: { size: 'm' } }] };

describe('product options HTTP repository', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ProductOptionsHttpRepository] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the dedicated admin projection and writes the exact CAS body', async () => {
    const repository = TestBed.inject(ProductOptionsHttpRepository), http = TestBed.inject(HttpTestingController);
    const read = firstValueFrom(repository.read('PRODUCT/1'));
    const get = http.expectOne(`${environment.apiBaseUrl}/user/catalog/products/PRODUCT%2F1/options`);
    expect(get.request.method).toBe('GET'); get.flush(wire);
    const base = await read, command = optionCommand(base, optionDraft(base)), write = firstValueFrom(repository.write('PRODUCT/1', command));
    const put = http.expectOne(`${environment.apiBaseUrl}/user/catalog/products/PRODUCT%2F1/options`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ expectedRevision: 2, operation: 'Replace', axes: [{ code: 'size', label: 'Tamaño', presentation: 'SELECT', order: 0,
      values: [{ code: 'm', label: 'M', order: 0, swatchColor: null }] }], assignments: [{ variantId: '42', optionValues: { size: 'm' } }], variantOperations: [] });
    put.flush({ revision: 3, state: 'VALID' }); expect((await write).revision).toBe(3);
  });

  it('fails closed for an unknown write result and propagates conflicts without retry', async () => {
    const repository = TestBed.inject(ProductOptionsHttpRepository), http = TestBed.inject(HttpTestingController);
    const base = AdminProductOptionsMapper.fromWire(wire), invalid = firstValueFrom(repository.write('SKU', optionCommand(base, optionDraft(base))));
    const invalidResult = expect(invalid).rejects.toThrow('no verificable');
    http.expectOne(`${environment.apiBaseUrl}/user/catalog/products/SKU/options`).flush({ revision: 3, state: 'FUTURE' }); await invalidResult;
    const conflict = firstValueFrom(repository.write('SKU', optionCommand(base, optionDraft(base)))), rejected = expect(conflict).rejects.toMatchObject({ status: 409 });
    http.expectOne(`${environment.apiBaseUrl}/user/catalog/products/SKU/options`).flush({ errorCode: 'CATALOG_OPTION_REVISION_CONFLICT' }, { status: 409, statusText: 'Conflict' }); await rejected;
  });
});
