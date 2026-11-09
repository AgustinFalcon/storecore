import { TestBed } from '@angular/core/testing';
import { DispositionPhase } from '../../domain/order/return-disposition';
import { ReturnDispositionViewComponent } from '../../features/admin/return-disposition.view';
import { returnDispositionVisualExamples } from './return-disposition-scenarios';

describe('Return disposition presentation states', () => {
  for (const scenario of returnDispositionVisualExamples) {
    it(`renders ${scenario.label} without unsupported commands`, () => {
      TestBed.configureTestingModule({ imports: [ReturnDispositionViewComponent] });
      const fixture = TestBed.createComponent(ReturnDispositionViewComponent);
      fixture.componentRef.setInput('state', scenario.state); fixture.detectChanges();
      const page = fixture.nativeElement as HTMLElement;
      expect(page.querySelector('h2')?.textContent).toContain(scenario.state.phase.label);
      const actions = Array.from(page.querySelectorAll('button')).map(button => button.textContent?.trim());
      expect(actions.includes('Confirmar inspección y reposición')).toBe(scenario.state.phase === DispositionPhase.Reviewing);
      expect(page.querySelectorAll('input[type=number]').length > 0).toBe(scenario.state.phase.canEdit);
      if (scenario.state.phase.canRecover) expect(actions).toContain('Consultar resultado');
    });
  }
  it('reviews the saleable delta per item and requests explicit confirmation', () => {
    TestBed.configureTestingModule({ imports: [ReturnDispositionViewComponent] });
    const fixture = TestBed.createComponent(ReturnDispositionViewComponent);
    fixture.componentRef.setInput('state', returnDispositionVisualExamples[1].state); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('+2 unidades vendibles');
    expect(fixture.nativeElement.textContent).toContain('no se podrá editar');
    const confirm = vi.fn(); fixture.componentInstance.confirm.subscribe(confirm);
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(button => button.textContent?.includes('Confirmar inspección'))?.click();
    expect(confirm).toHaveBeenCalledOnce();
  });
});
