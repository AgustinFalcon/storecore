import { TestBed } from '@angular/core/testing';
import { MercadoLibreAccountStatus } from '../../domain/user/mercadolibre-account-status';
import { MercadoLibreReadPhase } from './mercadolibre-read-phase';
import { UserMercadoLibreState } from './user-mercadolibre.store';
import { UserMercadoLibreViewComponent } from './user-mercadolibre.view';

const ready: UserMercadoLibreState = {
  actor: { id: 'operator', roles: [] }, account: { authorized: true, accountRef: 'ML-STORE-01', status: MercadoLibreAccountStatus.Active },
  listings: [{ listingId: 'MLA-100', variationId: 'VAR-1', sku: 'WEB-KIT' }, { listingId: 'MLA-200', variationId: '', sku: 'WEB-LAMP' }],
  loading: false, errorMessage: '', readPhase: MercadoLibreReadPhase.Ready, hasSnapshot: true, query: '',
};

describe('User Mercado Libre read-only presentation', () => {
  function render(patch: Partial<UserMercadoLibreState> = {}) {
    TestBed.configureTestingModule({ imports: [UserMercadoLibreViewComponent] });
    const fixture = TestBed.createComponent(UserMercadoLibreViewComponent);
    fixture.componentRef.setInput('state', { ...ready, ...patch }); fixture.detectChanges(); return fixture;
  }

  it('shows account truth, aggregate counts and no productive action', () => {
    const fixture = render(); const text = fixture.nativeElement.textContent;
    expect(text).toContain('••••E-01'); expect(text).not.toContain('ML-STORE-01'); expect(text).toContain(MercadoLibreAccountStatus.Active.label);
    expect(fixture.componentInstance.presentation).toMatchObject({ mappingCount: 2, uniqueSkuCount: 2, variationCount: 1 });
    expect(text).toContain('todavía no están habilitados');
    expect(text).not.toMatch(/Conectar cuenta|Desconectar|Sincronizar ahora|Cambiar precio|Guardar mapeo/);
    expect(fixture.nativeElement.querySelectorAll('form')).toHaveLength(0);
  });

  it('filters by publication, variation or SKU and recovers from no results', () => {
    const fixture = render({ query: 'var-1' }); expect(fixture.componentInstance.presentation.visibleListings).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('MLA-100');
    fixture.componentRef.setInput('state', { ...ready, query: 'missing' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin coincidencias');
    const clear = vi.fn(); fixture.componentInstance.clearQuery.subscribe(clear);
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((item) => item.textContent?.includes('Mostrar todos'));
    button?.click(); expect(clear).toHaveBeenCalledOnce();
  });

  it('keeps stale data visible and identifies unknown provider state honestly', () => {
    const fixture = render({ account: { authorized: true, accountRef: 'ML-STORE-01', status: MercadoLibreAccountStatus.Unknown }, readPhase: MercadoLibreReadPhase.Stale, errorMessage: 'Servicio no disponible' });
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('última consulta');
    expect(fixture.nativeElement.textContent).toContain(MercadoLibreAccountStatus.Unknown.label);
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  for (const readPhase of [MercadoLibreReadPhase.AccessDenied, MercadoLibreReadPhase.Unknown]) {
    it(`fails closed for ${readPhase.label}`, () => {
      const fixture = render({ readPhase }); expect(fixture.nativeElement.querySelector('table')).toBeNull();
      expect(fixture.nativeElement.querySelector('input')).toBeNull(); expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    });
  }

  it('distinguishes first loading, first error and a successful empty listing set', () => {
    const fixture = render({ account: null, listings: [], hasSnapshot: false, loading: true, readPhase: MercadoLibreReadPhase.Loading });
    expect(fixture.nativeElement.textContent).toContain('Cargando cuenta');
    fixture.componentRef.setInput('state', { ...ready, account: null, listings: [], hasSnapshot: false, readPhase: MercadoLibreReadPhase.Error, errorMessage: 'Falló' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar');
    fixture.componentRef.setInput('state', { ...ready, listings: [] }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin publicaciones vinculadas');
  });
});
