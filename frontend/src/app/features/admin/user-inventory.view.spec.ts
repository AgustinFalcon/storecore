import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserInventoryViewComponent } from './user-inventory.view';

describe('UserInventoryViewComponent', () => {
  let fixture: ComponentFixture<UserInventoryViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserInventoryViewComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(UserInventoryViewComponent);
  });

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows Disponible, Reservado and Safety as text, with no stock-write control', () => {
    fixture.componentRef.setInput('rows', [
      { sku: 'SKU-1', availableQuantity: 4, reservedQuantity: 1, safetyStock: 2 },
    ]);
    const el = render();
    expect([...el.querySelectorAll('th')].map((th) => th.textContent?.trim())).toEqual([
      'SKU',
      'Disponible',
      'Reservado',
      'Safety',
    ]);
    const cells = [...el.querySelectorAll('tbody td')];
    expect(cells.map((td) => td.textContent?.trim())).toEqual(['SKU-1', '4', '1', '2']);
    for (const cell of cells.slice(1)) {
      expect(cell.querySelector('input, textarea, select, button')).toBeNull();
    }
    expect(el.querySelectorAll('input, textarea, select').length).toBe(0);
  });

  it('keeps the empty state and the error state with Reintentar', () => {
    fixture.componentRef.setInput('rows', []);
    let el = render();
    expect(el.textContent).toContain('No hay filas de inventario.');
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelectorAll('input, textarea, select').length).toBe(0);

    fixture.componentRef.setInput('loading', true);
    el = render();
    expect(el.textContent).toContain('Cargando…');
    expect(el.textContent).not.toContain('No hay filas de inventario.');

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', 'No se pudo leer el inventario.');
    el = render();
    expect(el.textContent).toContain('No se pudo leer el inventario.');
    expect(el.querySelector('button.status__retry')?.textContent).toContain('Reintentar');
    expect(el.textContent).not.toContain('No hay filas de inventario.');
    expect(el.querySelectorAll('input, textarea, select').length).toBe(0);
  });
});
