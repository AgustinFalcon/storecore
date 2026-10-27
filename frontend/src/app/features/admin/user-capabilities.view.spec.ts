import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CapabilityFilter } from '../../domain/user/capability-filter';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityTargetPolicy } from '../../domain/user/capability-target-policy';
import { CapabilityReadState } from './capability-read-state';
import { UserCapabilitiesState } from './user-capabilities.store';
import { UserCapabilitiesViewComponent } from './user-capabilities.view';

const modules = [
  { id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Active, configVersion: 7 },
  { id: CapabilityModuleId.MarketplaceMl, state: CapabilityModuleState.Unknown, configVersion: null },
  { id: CapabilityModuleId.PaymentsMp, state: CapabilityModuleState.ReadOnly, configVersion: 3 },
];
const ready: UserCapabilitiesState = { modules, loading: false, errorMessage: '', readState: CapabilityReadState.Ready,
  hasSnapshot: true, query: '', filter: CapabilityFilter.All, selectedModule: null, policy: CapabilityTargetPolicy.RealReadOnly };

describe('User capabilities read-only presentation', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [UserCapabilitiesViewComponent], providers: [provideRouter([])] }));

  function render(patch: Partial<UserCapabilitiesState> = {}) {
    const fixture = TestBed.createComponent(UserCapabilitiesViewComponent);
    fixture.componentRef.setInput('state', { ...ready, ...patch }); fixture.detectChanges(); return fixture;
  }

  it('renders the exact seven commercial cards with three separate axes and no mutation control', () => {
    const fixture = render(); const text = fixture.nativeElement.textContent;
    expect(fixture.nativeElement.querySelectorAll('.capability-card')).toHaveLength(7);
    for (const name of ['Catálogo', 'Inventario', 'Mercado Libre', 'Outlet', 'ARCA', 'Envíos avanzados', 'Conectores de billeteras']) expect(text).toContain(name);
    expect(fixture.nativeElement.querySelectorAll('.capability-card__facts')).toHaveLength(7);
    expect(text).toContain('Estado operativo'); expect(text).toContain('Disponibilidad'); expect(text).toContain('Nivel de entrega');
    expect(text).not.toMatch(/Habilitar|Deshabilitar|Pausar módulo|Guardar cambio|Cambiar estado/);
    expect(fixture.nativeElement.querySelectorAll('form')).toHaveLength(0);
  });

  it('keeps every authoritative server row visible in a separate technical section', () => {
    const fixture = render(); const rows = fixture.nativeElement.querySelectorAll('.capabilities__table tbody tr');
    expect(rows).toHaveLength(3); expect(fixture.nativeElement.querySelector('.capabilities__technical').textContent).toContain('Pagos con Mercado Pago');
    expect(fixture.nativeElement.textContent).toContain('Versión 7');
  });

  it('keeps multiple future server rows distinct even when their closed id is Unknown', () => {
    const futureRows = [
      { id: CapabilityModuleId.Unknown, state: CapabilityModuleState.Active, configVersion: 1 },
      { id: CapabilityModuleId.Unknown, state: CapabilityModuleState.Paused, configVersion: 2 },
    ];
    const fixture = render({ modules: futureRows });
    const rows = fixture.nativeElement.querySelectorAll('.capabilities__table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('1');
    expect(rows[1].textContent).toContain('2');
  });

  it('derives open information from the current snapshot and clears it when access is lost', () => {
    vi.useFakeTimers();
    const fixture = render();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    const catalog = fixture.componentInstance.cards[0];
    fixture.componentInstance.openInformation(catalog, { currentTarget: null } as unknown as Event);
    expect(fixture.componentInstance.activeCard()?.operationalLabel).toBe(CapabilityModuleState.Active.label);
    fixture.componentRef.setInput('state', {
      ...ready,
      modules: [{ id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Paused, configVersion: 8 }],
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.activeCard()?.operationalLabel).toBe(CapabilityModuleState.Paused.label);
    fixture.componentRef.setInput('state', { ...ready, modules: [], hasSnapshot: false, readState: CapabilityReadState.AccessDenied });
    fixture.detectChanges();
    vi.runAllTimers();
    expect(fixture.componentInstance.activeCard()).toBeNull();
    expect(dialog.showModal).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('cancels a pending dialog open when the view is destroyed', () => {
    vi.useFakeTimers();
    const fixture = render();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    fixture.componentInstance.openInformation(
      fixture.componentInstance.cards[0],
      { currentTarget: null } as unknown as Event,
    );

    fixture.destroy();
    vi.runAllTimers();

    expect(dialog.showModal).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('combines normalized search and the closed operational-state filter', () => {
    let fixture = render({ query: 'envios' }); expect(fixture.componentInstance.visibleCards.map((card) => card.name)).toEqual(['Envíos avanzados']);
    fixture = render({ filter: CapabilityFilter.Active }); expect(fixture.componentInstance.visibleCards.map((card) => card.name)).toEqual(['Catálogo']);
    fixture = render({ filter: CapabilityFilter.Unknown }); expect(fixture.componentInstance.visibleCards.map((card) => card.name)).toEqual(['Mercado Libre']);
  });

  it('keeps stale data and distinguishes denied, unknown, loading, error and empty technical states', () => {
    let fixture = render({ readState: CapabilityReadState.Stale, errorMessage: 'Servicio no disponible' });
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('última consulta'); expect(fixture.nativeElement.querySelectorAll('.capability-card')).toHaveLength(7);
    fixture = render({ readState: CapabilityReadState.AccessDenied }); expect(fixture.nativeElement.querySelector('.capabilities__grid')).toBeNull();
    fixture = render({ readState: CapabilityReadState.Unknown }); expect(fixture.nativeElement.textContent).toContain('Estado de lectura no reconocido');
    fixture = render({ modules: [], hasSnapshot: false, loading: true, readState: CapabilityReadState.Loading }); expect(fixture.nativeElement.textContent).toContain('Cargando módulos');
    fixture = render({ modules: [], hasSnapshot: false, readState: CapabilityReadState.Error, errorMessage: 'Falló' }); expect(fixture.nativeElement.textContent).toContain('No pudimos cargar');
    fixture = render({ modules: [] }); expect(fixture.nativeElement.textContent).toContain('Sin módulos técnicos configurados'); expect(fixture.nativeElement.querySelectorAll('.capability-card')).toHaveLength(7);
  });
});
