import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { EMAIL_VERIFICATION_REPOSITORY } from '../../core/tokens/email-verification.tokens';
import { EmailOwnership, VerificationRequestResult, VerificationRequestState as RequestState } from '../../domain/access/email-verification';
import { RecoveryRealm } from '../../domain/access/recovery';
import { UserRole } from '../../domain/user/user-role';
import { EmailOwnershipComponent } from './email-ownership.component';

describe('accessible account email verification panel', () => {
  it('keeps the same request button focused while submitting and cooling down without asserting ownership', () => {
    vi.useFakeTimers();
    const pending = new Subject<VerificationRequestResult>();
    const repository = { ownership: vi.fn(() => of(EmailOwnership.Unknown)), request: vi.fn(() => pending) };
    TestBed.configureTestingModule({ imports: [EmailOwnershipComponent], providers: [{ provide: EMAIL_VERIFICATION_REPOSITORY, useValue: repository }] });
    TestBed.inject(CustomerSession).markAuthenticated({ id: 'one', email: 'person@example.test', firstName: 'Persona', lastName: 'Uno', phone: '' });
    const fixture = TestBed.createComponent(EmailOwnershipComponent); fixture.componentRef.setInput('realm', RecoveryRealm.Customer); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement, button = host.querySelector('button')!;
    button.focus(); button.click(); fixture.detectChanges(); expect(globalThis.document.activeElement).toBe(button); expect(button.getAttribute('aria-disabled')).toBe('true');
    pending.next({ state: RequestState.Accepted, cooldownSeconds: 60 }); fixture.detectChanges(); expect(host.querySelector('button')).toBe(button); expect(globalThis.document.activeElement).toBe(button);
    expect(host.textContent).toContain(EmailOwnership.Unknown.label); expect(host.textContent).toContain(RequestState.Accepted.label); expect(host.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    button.click(); expect(repository.request).toHaveBeenCalledTimes(1); vi.advanceTimersByTime(60_000); fixture.detectChanges(); expect(button.getAttribute('aria-disabled')).toBe('false');
    fixture.destroy(); vi.useRealTimers();
  });
  it('refreshes after an authoritative profile revision and clears state on principal loss', () => {
    const repository = { ownership: vi.fn(() => of(EmailOwnership.Verified)), request: vi.fn(() => of({ state: RequestState.Accepted })) };
    TestBed.configureTestingModule({ imports: [EmailOwnershipComponent], providers: [{ provide: EMAIL_VERIFICATION_REPOSITORY, useValue: repository }] });
    const session = TestBed.inject(UserSession); session.markAuthenticated({ id: 'one', roles: [UserRole.Operator] });
    const fixture = TestBed.createComponent(EmailOwnershipComponent); fixture.componentRef.setInput('realm', RecoveryRealm.User); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(EmailOwnership.Verified.label);
    repository.ownership.mockReturnValue(of(EmailOwnership.Unknown)); fixture.componentRef.setInput('revision', 1); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain(EmailOwnership.Unknown.label);
    session.clear(); fixture.detectChanges(); fixture.componentInstance.store.request(); expect(repository.request).not.toHaveBeenCalled(); expect(fixture.componentInstance.store.snapshot.canRequest).toBe(false); fixture.destroy();
  });
});
