import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, NavigationSkipped, Router, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { EMAIL_VERIFICATION_REPOSITORY } from '../../core/tokens/email-verification.tokens';
import { VerificationLinkResult, VerificationOutcome as Outcome } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';
import { EmailVerificationComponent } from './email-verification.component';

describe('verification fragment cleanup and accessible explicit confirmation', () => {
  it('removes the actual fragment before inspect, keeps preview read-only and focuses result after confirmation', async () => {
    const fragment = new BehaviorSubject<string | null>('stale-router-token'), events = new Subject<NavigationEnd | NavigationSkipped>();
    const document = globalThis.document;
    const history = document.defaultView!.history;
    history.replaceState(null, '', `/verify-email#realm=user&token=${'a'.repeat(43)}`);
    const replaceState = vi.spyOn(history, 'replaceState');
    const completion = new Subject<VerificationLinkResult>();
    const repository = { inspect: vi.fn(() => { expect(document.location.hash).toBe(''); expect(replaceState).toHaveBeenCalled(); return of({ outcome: Outcome.Ready, expiresAt: Date.now() + 60_000 }); }), complete: vi.fn(() => completion) };
    TestBed.configureTestingModule({ imports: [EmailVerificationComponent], providers: [provideRouter([]), { provide: EMAIL_VERIFICATION_REPOSITORY, useValue: repository }, { provide: ActivatedRoute, useValue: { fragment } }] });
    expect(TestBed.inject(DOCUMENT)).toBe(document);
    // RouterLink uses the real router; only the event source is replaced.
    vi.spyOn(TestBed.inject(Router), 'events', 'get').mockReturnValue(events);
    const fixture = TestBed.createComponent(EmailVerificationComponent); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(repository.inspect).toHaveBeenCalledExactlyOnceWith(RecoveryRealm.User, 'a'.repeat(43)); expect(repository.complete).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite'); expect(document.activeElement?.id).toBe('verify-title');
    const account = host.querySelector('a[href*="USER_ACCOUNT"]') as HTMLAnchorElement;
    expect(account).toBeTruthy(); expect(account.href).toContain('recoveredRealm=user');
    const login = host.querySelector('a[href*="USER_ACCOUNT"]') as HTMLAnchorElement;
    expect(login).toBeTruthy(); expect(login.href).toContain('recoveredRealm=user');
    fragment.next('stale-router-token'); events.next(new NavigationEnd(1, '/verify-email', '/verify-email')); expect(repository.inspect).toHaveBeenCalledTimes(1);
    const button = host.querySelector('button')!; button.focus(); button.click(); fixture.detectChanges(); expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click(); expect(repository.complete).toHaveBeenCalledExactlyOnceWith(RecoveryRealm.User, 'a'.repeat(43));
    completion.next({ outcome: Outcome.Verified }); fixture.detectChanges(); expect(host.querySelector('[role="status"]')?.textContent).toContain(Outcome.Verified.label); expect(document.activeElement?.id).toBe('verify-title');
    history.replaceState(null, '', `/verify-email#realm=unknown&token=${'a'.repeat(43)}`);
    events.next(new NavigationSkipped(2, '/verify-email', 'same route')); fixture.detectChanges();
    expect(document.location.hash).toBe(''); expect(repository.inspect).toHaveBeenCalledTimes(1); expect(host.querySelector('a[href*="USER_ACCOUNT"]')).toBeNull();
    history.replaceState(null, '', `/verify-email#realm=user&token=${'a'.repeat(43)}`);
    events.next(new NavigationSkipped(3, '/verify-email', 'same route')); fixture.detectChanges(); expect(repository.inspect).toHaveBeenCalledTimes(2);
    fixture.destroy(); replaceState.mockRestore(); history.replaceState(null, '', '/');
  });
});
