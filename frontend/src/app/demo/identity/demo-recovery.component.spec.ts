import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DemoApplicationState } from '../demo-state';
import { DemoRecoveryComponent } from './demo-recovery.component';
import { DemoRecoveryPhase as Phase } from './demo-recovery-phase';

describe('SC03 presentation boundary', () => {
  it('only reads the session epoch and resets transient inputs after a context change', () => {
    const epoch = signal(0);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: DemoApplicationState, useValue: { sessionEpoch: epoch } }, { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: 'https://external.invalid' }) } } }] });
    const fixture = TestBed.createComponent(DemoRecoveryComponent); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.email = 'person@demo.invalid'; component.simulate(Phase.Completed); expect(component.phase).toBe(Phase.Completed);
    epoch.update(value => value + 1); fixture.detectChanges(); expect(component.phase).toBe(Phase.Request); expect(component.email).toBe('');
    expect(component.returnQuery?.returnUrl).toBe('/demo'); fixture.destroy();
  });
});
