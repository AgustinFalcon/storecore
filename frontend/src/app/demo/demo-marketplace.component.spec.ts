import { TestBed } from '@angular/core/testing';
import { DemoMarketplaceComponent } from './demo-marketplace.component';
import { DemoApplicationState } from './demo-state';
import { DemoCommerce, demoSeed } from './demo-model';
import { DemoMLAccountStatus, DemoObservationStatus, ensureCompetitorDetails } from './demo-marketplace';

describe('marketplace component domain guards', () => {
  function fixture() {
    const commerce = new DemoCommerce(demoSeed()); commerce.setMLAccount(DemoMLAccountStatus.Authorized);
    const run = vi.fn((operation: () => void) => { operation(); return true; });
    TestBed.configureTestingModule({ providers: [{ provide: DemoApplicationState, useValue: { data: commerce.snapshot, commerce, run } }] });
    const component = TestBed.runInInjectionContext(() => new DemoMarketplaceComponent());
    return { commerce, component, run };
  }
  it('repeat with no previous sale is a no-op even when the handler is invoked directly', () => {
    const { commerce, component, run } = fixture(); const mapping = component.market.mappings[0];
    const before = JSON.stringify(commerce.snapshot);
    expect(component.lastSale(mapping)).toBeUndefined(); component.sale(mapping);
    expect(run).not.toHaveBeenCalled(); expect(JSON.stringify(commerce.snapshot)).toBe(before);
    component.newSale(mapping); const sold = JSON.stringify(commerce.snapshot);
    expect(component.lastSale(mapping)).toBeDefined(); component.sale(mapping);
    expect(JSON.stringify(commerce.snapshot)).toBe(sold);
  });
  it('Unknown availability disables transitions and direct UI calls cannot overwrite it', () => {
    const { commerce, component } = fixture(); const value = commerce.snapshot.competitors[0];
    ensureCompetitorDetails(value, commerce.snapshot).availability = DemoObservationStatus.Unknown;
    const before = JSON.stringify(commerce.snapshot);
    for (const target of [DemoObservationStatus.Stale, DemoObservationStatus.Unavailable, DemoObservationStatus.Recent]) {
      expect(component.canObserve(value, target)).toBe(false);
      expect(() => component.observation(value, target)).toThrow('desconocida');
    }
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
  });
});
