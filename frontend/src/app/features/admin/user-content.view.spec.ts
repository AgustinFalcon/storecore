import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomeContentPhase as Phase } from '../../domain/user/home-content-phase';
import { HomeBlockKind as Kind, HomeComposition } from '../../domain/content/home-composition';
import { UserContentViewComponent } from './user-content.view';
const home: HomeComposition = {revision: 1, sections: [{key: 'hero', kind: Kind.Hero, active: true, sortOrder: 0, content: {title: '<script>Título</script>', body: 'Texto'}, updatedAt: null}]};
function setup(phase = Phase.Editing, composition = home) {
  TestBed.configureTestingModule({imports: [UserContentViewComponent], providers: [provideRouter([])]});
  const fixture = TestBed.createComponent(UserContentViewComponent);
  fixture.componentRef.setInput('state', {home: composition, published: {...home, sections: []}, phase, errorMessage: '', conflict: false});
  fixture.detectChanges(); return fixture;
}
describe('composition editor view', () => {
  it('previews escaped content, emits explicit publication and discard', () => {
    const fixture = setup(), element: HTMLElement = fixture.nativeElement;
    const preview = element.querySelector('aside')!;
    expect(preview.textContent).toContain('<script>Título</script>'); expect(preview.querySelector('script')).toBeNull();
    const save = vi.fn(), discard = vi.fn(); fixture.componentInstance.save.subscribe(save); fixture.componentInstance.discard.subscribe(discard);
    const buttons = Array.from(element.querySelectorAll('button'));
    buttons.find(button => button.textContent?.includes('Publicar cambios'))!.click();
    buttons.find(button => button.textContent?.includes('Descartar cambios'))!.click();
    expect(save).toHaveBeenCalledOnce(); expect(discard).toHaveBeenCalledOnce();
  });
  it('adds distinct typed blocks, edits references, reorders and removes by stable key', () => {
    const fixture = setup(), view = fixture.componentInstance, change = vi.fn(); view.homeChange.subscribe(change);
    view.add(Kind.CategoryRail); const next = change.mock.calls[0][0] as HomeComposition;
    expect(next.sections[1].kind).toBe(Kind.CategoryRail); expect(next.sections[1].key).not.toBe(home.sections[0].key);
    fixture.componentRef.setInput('state', {...view.state, home: next}); fixture.detectChanges();
    view.references(1, '1, 2'); expect(change.mock.lastCall![0].sections[1].content.categoryIds).toEqual([1, 2]);
    view.move(1, -1); expect(change.mock.lastCall![0].sections.map((row: {sortOrder: number}) => row.sortOrder)).toEqual([0, 1]);
    expect(change.mock.lastCall![0].sections[0].kind).toBe(Kind.CategoryRail);
    view.remove(0); expect(change.mock.lastCall![0].sections).toHaveLength(1);
  });
  it('disables unsupported legacy editing, permits removal and locks all mutations during publication', () => {
    const legacy = {...home, sections: [{...home.sections[0], kind: Kind.Unknown}]};
    const fixture = setup(Phase.Editing, legacy); const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('fieldset')!.disabled).toBe(true); expect(element.querySelector('aside')!.textContent).not.toContain('<script>Título');
    const remove = element.querySelector<HTMLButtonElement>('[aria-label="Quitar bloque 1"]')!;
    expect(remove.disabled).toBe(false);
    fixture.componentRef.setInput('state', {...fixture.componentInstance.state, phase: Phase.Saving}); fixture.detectChanges();
    expect(remove.disabled).toBe(true); expect(Array.from(element.querySelectorAll('button')).every(button => button.disabled)).toBe(true);
  });
  it('offers explicit conflict reload with dirty draft and hides unloaded editor', () => {
    const fixture = setup(); fixture.componentRef.setInput('state', {...fixture.componentInstance.state, conflict: true, phase: Phase.Conflict}); fixture.detectChanges();
    const reload = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('conservar borrador'))!;
    const retry = vi.fn(); fixture.componentInstance.retry.subscribe(retry); expect(reload.disabled).toBe(false); reload.click(); expect(retry).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('state', {...fixture.componentInstance.state, published: null, phase: Phase.Loading}); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset')).toBeNull();
  });
});
