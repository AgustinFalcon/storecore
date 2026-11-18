import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OptionPresentation, OptionResolutionCause, OptionSelectionState, OptionValueAvailability } from '../../domain/catalog/option-schema';
import { ProductOptionSelectorComponent } from './product-option-selector.component';
import { SelectOptionAxisComponent } from './select-option-axis.component';
import { SwatchOptionAxisComponent } from './swatch-option-axis.component';

describe('ProductOptionSelector accessibility contract', () => {
  it('renders ordered native Select and semantic Swatch controls with text and disabled reasons', async () => {
    await TestBed.configureTestingModule({ imports: [ProductOptionSelectorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ProductOptionSelectorComponent);
    fixture.componentRef.setInput('selectionState', OptionSelectionState.Incomplete);
    fixture.componentRef.setInput('selectionCause', OptionResolutionCause.Partial);
    fixture.componentRef.setInput('axes', [
      { code: 'size', label: 'Talle', order: 0, presentation: OptionPresentation.Select, selectedValue: null, choices: [
        { code: 'm', label: 'Mediano', availability: OptionValueAvailability.Selectable, cause: null, swatchColor: null },
        { code: 'l', label: 'Grande', availability: OptionValueAvailability.Disabled, cause: OptionResolutionCause.NoCombination, swatchColor: null },
      ] },
      { code: 'tone', label: 'Tono', order: 1, presentation: OptionPresentation.Swatch, selectedValue: 'dark', choices: [
        { code: 'dark', label: 'Oscuro', availability: OptionValueAvailability.Selected, cause: null, swatchColor: '#111111' },
        { code: 'light', label: 'Claro', availability: OptionValueAvailability.Disabled, cause: OptionResolutionCause.NoCombination, swatchColor: null },
      ] },
    ]);
    fixture.detectChanges(); await fixture.whenStable();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.options[0].textContent).toContain('Elegí Talle');
    expect(select.options[2].disabled).toBe(true);
    expect(select.options[2].textContent).toContain(OptionResolutionCause.NoCombination.label);
    expect(fixture.nativeElement.querySelector('fieldset legend').textContent).toContain('Tono');
    const radios = fixture.nativeElement.querySelectorAll('input[type=radio]') as NodeListOf<HTMLInputElement>;
    expect(radios.length).toBe(2);
    expect(radios[0].checked).toBe(true);
    expect(radios[1].disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Claro');
    expect(fixture.nativeElement.textContent).toContain(OptionResolutionCause.NoCombination.label);
    expect(fixture.nativeElement.querySelector('.sc-swatch__color').style.getPropertyValue('--sc-swatch-color')).toBe('#111111');
    expect(fixture.nativeElement.textContent).toContain(OptionResolutionCause.Partial.label);
  });

  it('never emits a forced disabled choice', async () => {
    await TestBed.configureTestingModule({ imports: [ProductOptionSelectorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ProductOptionSelectorComponent);
    fixture.componentRef.setInput('axes', [{ code: 'size', label: 'Talle', order: 0, presentation: OptionPresentation.Select,
      selectedValue: null, choices: [{ code: 'l', label: 'Grande', availability: OptionValueAvailability.Disabled,
        cause: OptionResolutionCause.NoCombination, swatchColor: null }] }]);
    fixture.detectChanges();
    const emitted = vi.fn(); fixture.componentInstance.choose.subscribe(emitted);
    fixture.debugElement.query(By.directive(SelectOptionAxisComponent)).componentInstance.select('l');
    expect(emitted).not.toHaveBeenCalled();
    fixture.componentRef.setInput('axes', [{ code: 'tone', label: 'Tono', order: 0, presentation: OptionPresentation.Swatch,
      selectedValue: null, choices: [{ code: 'dark', label: 'Oscuro', availability: OptionValueAvailability.Disabled,
        cause: OptionResolutionCause.NoCombination, swatchColor: '#111111' }] }]);
    fixture.detectChanges();
    fixture.debugElement.query(By.directive(SwatchOptionAxisComponent)).componentInstance.chooseValue('dark');
    expect(emitted).not.toHaveBeenCalled();
  });
});
