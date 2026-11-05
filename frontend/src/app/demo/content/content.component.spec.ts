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
});
