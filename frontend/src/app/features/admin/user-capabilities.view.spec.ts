import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CapabilityModule, CapabilityState } from '../../domain/user/user.entity';
import { InstallationStore } from './installation.store';
import { UserCapabilitiesComponent } from './user-capabilities.component';
import { UserCapabilitiesViewComponent } from './user-capabilities.view';

const STATES: readonly CapabilityState[] = ['DISABLED', 'READ_ONLY', 'ACTIVE', 'PAUSED', 'ERROR'];
const NOTICE = 'Esta instalación no prende capabilities desde la consola.';

describe('UserCapabilitiesViewComponent', () => {
  let fixture: ComponentFixture<UserCapabilitiesViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCapabilitiesViewComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(UserCapabilitiesViewComponent);
  });

  it('keeps the five states as chrome and does not change a module', () => {
    fixture.componentRef.setInput('items', [{ module: 'STOREFRONT', state: 'READ_ONLY' } satisfies CapabilityModule]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    for (const state of STATES) {
      expect(text).toContain(state);
    }
    expect(text).toContain(NOTICE);
    expect('changeState' in fixture.componentInstance).toBe(false);

    const buttons = [...fixture.nativeElement.querySelectorAll('button.sc-btn')] as HTMLButtonElement[];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([...STATES]);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });

  it('keeps loading, empty and error with Reintentar', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cargando');
    expect(fixture.nativeElement.textContent).toContain(NOTICE);

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', 'No se pudo leer.');
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.detectChanges();
    const retryButton = fixture.nativeElement.querySelector('.status__retry') as HTMLButtonElement;
    expect(retryButton.textContent).toContain('Reintentar');
    retryButton.click();
    expect(retry).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('error', '');
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay módulos configurados en esta instalación.');
  });
});

describe('UserCapabilitiesComponent', () => {
  it('loads capabilities and does not forward a state change', async () => {
    const changeCapability = vi.fn();
    const loadCapabilities = vi.fn();
    const store = {
      capabilities$: of<readonly CapabilityModule[]>([{ module: 'STOREFRONT', state: 'ACTIVE' }]),
      loading$: of(false),
      errorMessage$: of(''),
      loadCapabilities,
      changeCapability,
    };

    await TestBed.configureTestingModule({
      imports: [UserCapabilitiesComponent],
    })
      .overrideComponent(UserCapabilitiesComponent, {
        set: { providers: [{ provide: InstallationStore, useValue: store }] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(UserCapabilitiesComponent);
    fixture.detectChanges();

    expect(loadCapabilities).toHaveBeenCalledTimes(1);
    const buttons = [...fixture.nativeElement.querySelectorAll('button.sc-btn')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(STATES.length);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(changeCapability).not.toHaveBeenCalled();
  });
});
