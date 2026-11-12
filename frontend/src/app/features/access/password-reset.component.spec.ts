import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationSkipped, NavigationSkippedCode, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { PasswordResetComponent } from './password-reset.component';
import { RecoveryStore } from './recovery.store';

describe('reset fragment one-shot capture and route reuse', () => {
  let fragments: Subject<string | null>;
  let store: { initializeReset: ReturnType<typeof vi.fn> };
  let router: { events: Subject<unknown>; navigateByUrl: ReturnType<typeof vi.fn> };
  const link = `realm=customer&token=${'a'.repeat(43)}`;
  beforeEach(() => {
    fragments = new Subject(); store = { initializeReset: vi.fn() };
    router = { events: new Subject(), navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: { fragment: fragments } }, { provide: Router, useValue: router }] });
    TestBed.overrideComponent(PasswordResetComponent, { set: { template: '', imports: [], providers: [{ provide: RecoveryStore, useValue: store }] } });
  });
  function start() { const fixture = TestBed.createComponent(PasswordResetComponent); fixture.detectChanges(); return fixture; }
  function emit(fragment: string | null): void {
    TestBed.inject(DOCUMENT).defaultView!.history.replaceState(null, '', `/reset-password${fragment === null ? '' : `#${fragment}`}`);
    fragments.next(fragment);
  }
  it('cleans before inspection and ignores repeated null and empty cleanup emissions', () => {
    const document = TestBed.inject(DOCUMENT);
    store.initializeReset.mockImplementation(() => { expect(document.location.hash).toBe(''); fragments.next(''); fragments.next(null); });
    start(); emit(link); fragments.next(null); fragments.next('');
    expect(store.initializeReset).toHaveBeenCalledExactlyOnceWith(link);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it.each([null, ''])('preserves a direct invalid empty load %s without creating a cleanup loop', fragment => {
    start(); emit(fragment); fragments.next(null); fragments.next('');
    expect(store.initializeReset).toHaveBeenCalledExactlyOnceWith('');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('accepts a later link and the same link again on a reused route without empty events resetting the store', () => {
    start(); emit(null); emit(link); fragments.next(''); fragments.next(null);
    TestBed.inject(DOCUMENT).defaultView!.history.replaceState(null, '', `/reset-password#${link}`);
    router.events.next(new NavigationSkipped(1, `/reset-password#${link}`, 'same URL', NavigationSkippedCode.IgnoredSameUrlNavigation));
    fragments.next('');
    expect(store.initializeReset.mock.calls.map(call => call[0])).toEqual(['', link, link]);
  });
  it('does not replay a stale ActivatedRoute token when a component is destroyed and recreated after cleanup', () => {
    const first = start(); emit(link); first.destroy();
    start(); fragments.next(link);
    expect(store.initializeReset.mock.calls.map(call => call[0])).toEqual([link, '']);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
