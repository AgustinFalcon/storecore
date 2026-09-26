import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminCatalogState, emptyProductDraft } from './admin-catalog.store';
import { UserCatalogViewComponent } from './user-catalog.view';

describe('UserCatalogViewComponent price columns', () => {
  let fixture: ComponentFixture<UserCatalogViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCatalogViewComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(UserCatalogViewComponent);
  });

  it('shows base, desired, observed and effective as separate read-only columns', () => {
    const state = catalogState();
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const headers = [...fixture.nativeElement.querySelectorAll('th')].map((cell: HTMLElement) => cell.textContent?.trim());
    expect(headers).toEqual(['SKU', 'Nombre', 'Estado', 'Base', 'Deseado', 'Observado', 'Efectivo']);

    const price = state.products[0].price;
    const cells = [...fixture.nativeElement.querySelectorAll('[data-price-kind]')] as HTMLElement[];
    expect(cells.map((cell) => cell.dataset['priceKind'])).toEqual(['base', 'desired', 'observed', 'effective']);
    expect(cells.map((cell) => cell.querySelector('.sc-price__kind')?.textContent?.trim())).toEqual([
      'Base',
      'Deseado',
      'Observado',
      'Efectivo',
    ]);
    expect(cells.every((cell) => cell.querySelector('input') === null)).toBe(true);
    expect(cells[0].textContent).toContain(String(price.base));
    expect(cells[1].textContent).toContain(String(price.desired));
    expect(cells[2].textContent).toContain(String(price.observed));
    expect(cells[3].textContent).toContain(String(price.effective));
    expect(cells[0].classList.contains('sc-price')).toBe(false);
    expect(cells[2].classList.contains('sc-price')).toBe(false);
    expect(cells[3].classList.contains('sc-price')).toBe(true);

    const names = [...fixture.nativeElement.querySelectorAll('input')].map((input: HTMLInputElement) => input.name);
    expect(names).toContain('base');
    expect(names).toContain('desired');
    expect(names).not.toContain('observed');
    expect(names).not.toContain('effective');
  });

  it('shows a dash when desired and observed are absent', () => {
    const state = catalogState();
    const product = {
      ...state.products[0],
      price: { ...state.products[0].price, desired: null, observed: null },
    };
    fixture.componentRef.setInput('state', { ...state, products: [product], draft: product });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-price-kind="desired"]')?.textContent).toContain('—');
    expect(fixture.nativeElement.querySelector('[data-price-kind="observed"]')?.textContent).toContain('—');
    expect(fixture.nativeElement.querySelector('[data-price-kind="observed"] input')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-price-kind="effective"] input')).toBeNull();
  });

  it('keeps the empty copy and the retry control', () => {
    const state = catalogState();
    fixture.componentRef.setInput('state', { ...state, products: [], errorMessage: '' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay productos en esta instalación.');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();

    fixture.componentRef.setInput('state', { ...state, products: [], errorMessage: 'No se pudo leer el catálogo.' });
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector('.status__retry') as HTMLButtonElement;
    const emitted = vi.fn();
    fixture.componentInstance.retry.subscribe(emitted);
    retry.click();
    expect(fixture.nativeElement.textContent).toContain('No se pudo leer el catálogo.');
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
    expect(emitted).toHaveBeenCalledOnce();
  });
});

function catalogState(): AdminCatalogState {
  const product = {
    ...emptyProductDraft,
    sku: 'fila',
    name: 'pieza',
    price: { ...emptyProductDraft.price, base: 11, desired: 22, observed: 33, effective: 44 },
  };
  return {
    loading: false,
    errorMessage: '',
    products: [product],
    brands: [],
    categories: [],
    draft: product,
    brandDraft: { id: '', name: '' },
    categoryDraft: { id: '', name: '' },
  };
}
