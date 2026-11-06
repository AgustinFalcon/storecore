import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DemoApplicationState } from '../demo-state';
import { DemoContext } from '../demo-model';
import { DemoSnapshotWriter } from '../demo-snapshot-writer';
import { DemoContentComponent } from './content.component';

describe('SC16 lifecycle and navigation adapter', () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); vi.spyOn(DemoSnapshotWriter.browser, 'assertWritable').mockImplementation(() => {});
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.overrideComponent(DemoContentComponent, { set: { template: '' } });
  });
  afterEach(() => vi.restoreAllMocks());
  function setup() {
    const state = TestBed.inject(DemoApplicationState); state.login(DemoContext.Admin);
    const fixture = TestBed.createComponent(DemoContentComponent); fixture.detectChanges();
    const component = fixture.componentInstance; component.flow.draft.title = 'Unsaved'; component.flow.edit();
    return { state, fixture, component };
  }
  it('shares one pending leave decision; cancel keeps input and discard resolves it once', async () => {
    const { component, fixture } = setup();
    const first = component.canLeave(); expect(component.canLeave()).toBe(first); component.close(); expect(await first).toBe(false); expect(component.flow.draft.title).toBe('Unsaved');
    const next = component.canLeave(); component.confirmDiscard(); expect(await next).toBe(true); expect(component.flow.dirty).toBe(false); fixture.destroy();
  });
  it('prevents deferred writes after destruction or logout/login as the same actor', async () => {
    for (const destroy of [false, true]) {
      const { state, fixture, component } = setup(); const save = vi.spyOn(state, 'saveContentDraft');
      const pending = component.save();
      if (destroy) fixture.destroy(); else { state.logout(); state.login(DemoContext.Admin); fixture.detectChanges(); }
      await pending; expect(save).not.toHaveBeenCalled(); if (!destroy) fixture.destroy();
      save.mockRestore();
    }
  });
  it('clears private input and permits shell logout navigation', () => {
    const { state, component, fixture } = setup(); state.logout(); expect(component.canLeave()).toBe(true); expect(component.flow.draft.title).toBe(''); fixture.destroy();
  });
  it('requests native unload confirmation only while authorized changes are unsaved', () => {
    const { component, fixture } = setup();
    const dirty = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(dirty); expect(dirty.defaultPrevented).toBe(true);
    component.flow.discard();
    const clean = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(clean); expect(clean.defaultPrevented).toBe(false); fixture.destroy();
  });
  it('edits banners and category order with isolated preview, discard and authority guards', () => {
    const { component, fixture, state } = setup();
    component.flow.discard(); const categories = [...component.selectedCategories], savedBanners = component.flow.preview().banners;
    component.addBanner(); component.addBanner(); component.addBanner(); component.addBanner();
    expect(component.flow.draft.banners).toHaveLength(3);
    component.flow.draft.banners![0].title = 'Primero'; component.flow.draft.banners![1].title = 'Segundo'; component.moveBanner(0, 1);
    expect(component.flow.preview().banners![0].title).toBe('Segundo');
    component.toggleCategory(categories[0], false); expect(component.selectedCategories).not.toContain(categories[0]);
    component.toggleCategory(categories[0], true); expect(component.selectedCategories.at(-1)).toBe(categories[0]);
    component.moveCategory(component.selectedCategories.length - 1, -1);
    expect(component.flow.dirty).toBe(true); component.flow.discard(); expect(component.flow.draft.banners).toEqual(savedBanners); expect(component.selectedCategories).toEqual(categories);
    state.logout(); component.canLeave(); component.addBanner(); component.toggleCategory(categories[0], true);
    expect(component.flow.draft.banners).toEqual([]); expect(component.flow.draft.categories).toEqual([]); fixture.destroy();
  });
  it('lets an administrator remove a saved category after its last active product disappears', () => {
    const { component, fixture } = setup(); component.flow.draft.categories = ['Categoría retirada']; component.flow.edit();
    expect(component.selectedCategories).toEqual(['Categoría retirada']); expect(component.previewCategories).toEqual([]);
    component.removeCategory('Categoría retirada');
    expect(component.flow.draft.categories).toEqual([]); expect(component.flow.dirty).toBe(true); fixture.destroy();
  });
});
