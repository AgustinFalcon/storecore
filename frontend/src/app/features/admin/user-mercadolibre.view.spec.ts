import { TestBed } from '@angular/core/testing';
import { MercadoLibreListing } from '../../domain/user/user.entity';
import { InstallationState } from './installation.store';
import { UserMercadoLibreViewComponent } from './user-mercadolibre.view';

const emptyCopy = 'No hay listings mapeados.';

function listing(partial: Partial<MercadoLibreListing> = {}): MercadoLibreListing {
  return { listingId: 'MLA-1', variationId: '1', sku: 'SKU-1', ...partial };
}

function state(partial: Partial<InstallationState> = {}): InstallationState {
  return {
    loading: false,
    errorMessage: '',
    capabilities: [],
    inventory: [],
    mlAccount: { authorized: true, accountRef: 'MLA-ACC', status: 'ACTIVE' },
    listings: [],
    listingDraft: { listingId: '', variationId: '', sku: '' },
    ...partial,
  };
}

describe('Mercado Libre listing map empty state', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UserMercadoLibreViewComponent],
    });
  });

  function render(value: InstallationState): HTMLElement {
    const fixture = TestBed.createComponent(UserMercadoLibreViewComponent);
    fixture.componentRef.setInput('state', value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('hides the empty sentence while listings are loading', () => {
    const view = render(state({ loading: true, listings: [] }));
    expect(view.textContent).not.toContain(emptyCopy);
    expect(view.textContent).toContain('Cargando…');
    expect(view.textContent).toContain('Nuevo mapeo');
  });

  it('hides the empty sentence when the load failed', () => {
    const view = render(state({ listings: [], errorMessage: 'El API de esta instalación no responde.' }));
    expect(view.textContent).not.toContain(emptyCopy);
    expect(view.textContent).toContain('El API de esta instalación no responde.');
    expect(view.textContent).toContain('Cuenta vinculada');
  });

  it('shows the empty sentence only after a successful load returned no listings', () => {
    const unloaded = render(state({ listings: null }));
    expect(unloaded.textContent).not.toContain(emptyCopy);
    expect(unloaded.textContent).toContain('Nuevo mapeo');

    const empty = render(state({ listings: [], loading: false, errorMessage: '' }));
    expect(empty.textContent).toContain(emptyCopy);
    expect(empty.textContent).toContain('Cuenta vinculada');
    expect(empty.textContent).toContain('Nuevo mapeo');
    expect(empty.querySelector('table')).toBeNull();
  });

  it('hides the empty sentence when at least one listing exists', () => {
    const view = render(state({ listings: [listing()] }));
    expect(view.textContent).not.toContain(emptyCopy);
    expect(view.textContent).toContain('MLA-1');
    expect(view.textContent).toContain('SKU-1');
    expect(view.querySelector('table')).not.toBeNull();
  });
});
