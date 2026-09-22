import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CustomerHttpRepository } from './customer-http.repository';

const address = {
  id: 'a-1',
  street: 'Calle',
  number: '1',
  city: 'CABA',
  province: 'CABA',
  postalCode: '1001',
  isDefault: true,
};

describe('CustomerHttpRepository', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CustomerHttpRepository],
    });
  });

  it('POSTs a new address on /me/addresses without an empty id', async () => {
    const repo = TestBed.inject(CustomerHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.saveAddress({ ...address, id: '' }));
    const req = ctrl.expectOne('/api/v1/customer/me/addresses');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      street: 'Calle',
      number: '1',
      city: 'CABA',
      province: 'CABA',
      postalCode: '1001',
      isDefault: true,
    });
    req.flush(address);
    await expect(pending).resolves.toEqual(address);
  });

  it('PUTs an existing address by id', async () => {
    const repo = TestBed.inject(CustomerHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.saveAddress(address));
    const req = ctrl.expectOne('/api/v1/customer/me/addresses/a-1');
    expect(req.request.method).toBe('PUT');
    req.flush(address);
    await pending;
  });

  it('logs in on the canonical auth path', async () => {
    const repo = TestBed.inject(CustomerHttpRepository);
    const ctrl = TestBed.inject(HttpTestingController);
    const pending = firstValueFrom(repo.signIn({ email: 'a@b.c', password: 'x' }));
    const req = ctrl.expectOne('/api/v1/customer/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 9, email: 'a@b.c', firstName: 'A', lastName: 'B' });
    await expect(pending).resolves.toEqual({ id: '9', email: 'a@b.c', firstName: 'A', lastName: 'B' });
  });
});
