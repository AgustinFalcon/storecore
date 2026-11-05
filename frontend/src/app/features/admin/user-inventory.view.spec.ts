import { TestBed } from '@angular/core/testing';
import { InventoryAvailability } from '../../domain/user/inventory-availability';
import { InventoryFilter } from '../../domain/user/inventory-filter';
import { InventoryReadState } from './user-inventory-read-state';
import { UserInventoryState } from './user-inventory.store';
import { UserInventoryViewComponent } from './user-inventory.view';

const rows = [
  { sku: 'WEB-A', availableQuantity: 8, reservedQuantity: 3, safetyStock: 2, availability: InventoryAvailability.Normal },
  { sku: 'WEB-B', availableQuantity: 0, reservedQuantity: 2, safetyStock: 1, availability: InventoryAvailability.Out },
];
const ready: UserInventoryState = { rows, query: '', filter: InventoryFilter.All, loading: false, hasSnapshot: true, errorMessage: '', readState: InventoryReadState.Ready };

describe('User inventory read-only presentation', () => {
  function render(patch: Partial<UserInventoryState> = {}) {
    TestBed.configureTestingModule({ imports: [UserInventoryViewComponent] });
    const fixture = TestBed.createComponent(UserInventoryViewComponent);
    fixture.componentRef.setInput('state', { ...ready, ...patch });
    fixture.detectChanges();
    return fixture;
  }

  it('keeps authoritative available totals and does not subtract reservations', () => {
    const fixture = render();
    expect(fixture.componentInstance.availableTotal).toBe(8);
    expect(fixture.componentInstance.reservedTotal).toBe(5);
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('input[type=number]')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toMatch(/Ajustar|Conciliar|Historial/);
  });

  it('combines case-insensitive search with the closed availability filter without changing summary', () => {
    const fixture = render({ query: 'web-b', filter: InventoryFilter.Out });
    expect(fixture.componentInstance.visibleRows).toEqual([rows[1]]);
    expect(fixture.componentInstance.availableTotal).toBe(8);
    expect(fixture.nativeElement.querySelector('tbody').textContent).not.toContain('WEB-A');
    fixture.componentRef.setInput('state', { ...ready, query: 'not-present' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin coincidencias');
    const clear = vi.fn();
    fixture.componentInstance.clearFilters.subscribe(clear);
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((element) => element.textContent?.includes('Mostrar todo'));
    button?.click(); expect(clear).toHaveBeenCalledOnce();
  });

  it('displays unknown quantities honestly and propagates missing totals', () => {
    const fixture = render({ rows: [{ sku: 'UNKNOWN', availableQuantity: null, reservedQuantity: 2, safetyStock: null, availability: InventoryAvailability.Unknown }] });
    expect(fixture.componentInstance.availableTotal).toBeNull();
    expect(fixture.componentInstance.safetyTotal).toBeNull();
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain(InventoryAvailability.Unknown.label);
    expect(fixture.nativeElement.querySelector('tbody').textContent).not.toContain('NaN');
  });

  it('retains rows during refresh and a stale error with an actionable retry', () => {
    const fixture = render({ loading: true, readState: InventoryReadState.Loading });
    expect(fixture.nativeElement.textContent).toContain('Conservamos la última consulta');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    fixture.componentRef.setInput('state', { ...ready, readState: InventoryReadState.Stale, errorMessage: 'Servicio no disponible' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Pueden haber cambiado');
    const retry = vi.fn(); fixture.componentInstance.retry.subscribe(retry);
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((element) => element.textContent?.includes('Reintentar'));
    button?.click(); expect(retry).toHaveBeenCalledOnce();
  });

  for (const readState of [InventoryReadState.AccessDenied, InventoryReadState.Unknown]) {
    it(`hides a previous snapshot for ${readState.label}`, () => {
      const fixture = render({ readState });
      expect(fixture.nativeElement.querySelector('table')).toBeNull();
      expect(fixture.nativeElement.querySelector('input')).toBeNull();
      expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    });
  }

  it('distinguishes first load, initial failure and a successful empty result', () => {
    const fixture = render({ rows: [], hasSnapshot: false, loading: true, readState: InventoryReadState.Loading });
    expect(fixture.nativeElement.textContent).toContain('Cargando inventario');
    fixture.componentRef.setInput('state', { ...ready, rows: [], hasSnapshot: false, readState: InventoryReadState.Error, errorMessage: 'Falló la consulta' });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('No pudimos cargar');
    fixture.componentRef.setInput('state', { ...ready, rows: [] });
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Sin inventario para mostrar');
  });
});
