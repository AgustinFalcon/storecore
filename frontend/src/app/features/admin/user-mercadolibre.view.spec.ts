import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InstallationState } from './installation.store';
import { UserMercadoLibreViewComponent } from './user-mercadolibre.view';

function state(partial: Partial<InstallationState> = {}): InstallationState {
  return {
    loading: false,
    errorMessage: '',
    capabilities: [],
    inventory: [],
    mlAccount: null,
    listings: [],
    listingDraft: { listingId: '', variationId: '', sku: '' },
    ...partial,
  };
}

describe('UserMercadoLibreViewComponent', () => {
  let fixture: ComponentFixture<UserMercadoLibreViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserMercadoLibreViewComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(UserMercadoLibreViewComponent);
  });

  function render(next: InstallationState): HTMLElement {
    fixture.componentRef.setInput('state', next);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows an honest empty state when there is no account and no listings', () => {
    const el = render(state());
    expect(fixture.componentInstance.installationEmpty).toBe(true);
    expect(el.textContent).toContain('No hay cuenta ni listings en esta instalación.');
    const labels = [...el.querySelectorAll('button')].map((button) => button.textContent ?? '');
    expect(labels.join(' ')).not.toMatch(/conectar|autorizar|oauth/i);
    expect(el.innerHTML).not.toMatch(/client[_-]?id|access[_-]?token|refresh[_-]?token/i);
  });

  it('keeps loading and error with Reintentar ahead of the empty state', () => {
    const loading = render(state({ loading: true }));
    expect(loading.textContent).toContain('Cargando…');
    expect(loading.textContent).not.toContain('No hay cuenta ni listings en esta instalación.');

    const failed = render(state({ errorMessage: 'No se pudo leer el canal.' }));
    expect(failed.textContent).toContain('No se pudo leer el canal.');
    expect(failed.querySelector('button.status__retry')?.textContent).toContain('Reintentar');
    expect(failed.textContent).not.toContain('No hay cuenta ni listings en esta instalación.');
  });

  it('keeps a listing row as a map onto a SKU', () => {
    const el = render(state({
      mlAccount: { authorized: true, accountRef: 'cuenta-1', status: 'ACTIVE' },
      listings: [{ listingId: 'MLA100', variationId: '1', sku: 'SKU-1' }],
    }));
    expect(el.textContent).not.toContain('No hay cuenta ni listings en esta instalación.');
    expect(el.querySelector('tbody button')?.textContent?.trim()).toBe('MLA100');
    expect([...el.querySelectorAll('th')].map((th) => th.textContent?.trim())).toEqual(['Listing', 'Variation', 'SKU']);
    expect(el.textContent).not.toMatch(/vender|comprar|checkout/i);
  });
});
