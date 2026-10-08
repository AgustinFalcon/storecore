import { TestBed } from '@angular/core/testing';
import { LoginResolution, LoginStage, IdentityRealm } from '../../domain/access/access.types';
import { AccessViewComponent } from './access.view';

describe('AccessView accessible controls', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [AccessViewComponent] }));
  const render = async (stage: LoginStage, resolution = LoginResolution.Unknown) => {
    const fixture = TestBed.createComponent(AccessViewComponent);
    fixture.componentRef.setInput('state', { stage, resolution, email: '', password: '', validationMessage: '' });
    fixture.detectChanges(); await fixture.whenStable();
    return fixture;
  };
  it('starts with labelled credential fields, autocomplete and native submit; no realm prompt', async () => {
    const fixture = await render(LoginStage.CollectCredentials);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[type=email]')?.getAttribute('autocomplete')).toBe('username');
    const password = element.querySelector('input[type=password]');
    expect(password?.getAttribute('autocomplete')).toBe('current-password');
    expect(password?.hasAttribute('maxlength')).toBe(false);
    expect(password?.getAttribute('aria-describedby')).toBe('access-password-requirements');
    expect(element.querySelectorAll('label').length).toBe(2);
    expect(element.querySelector('[aria-label="Contextos verificados"]')).toBeNull();
    const submit = vi.fn(); fixture.componentInstance.submitCredentials.subscribe(submit);
    element.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(submit).toHaveBeenCalled();
  });
  it('uses native keyboard-operable buttons for verified contexts and focuses the stage heading', async () => {
    const resolution = LoginResolution.fromWire({ kind: 'CONTEXT_SELECTION_REQUIRED', challenge: 'a'.repeat(32), contexts: ['CUSTOMER', 'USER'], expiresAt: '2030-01-01T00:00:00Z' });
    const fixture = await render(LoginStage.SelectContext, resolution);
    const element = fixture.nativeElement as HTMLElement;
    const buttons = element.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toContain(IdentityRealm.Customer.label);
    expect(buttons[1].textContent).toContain(IdentityRealm.User.label);
    const selected = vi.fn(); fixture.componentInstance.selectContext.subscribe(selected); buttons[0].click();
    expect(selected).toHaveBeenCalledWith(IdentityRealm.Customer);
    expect(document.activeElement).toBe(element.querySelector('h2'));
  });
  it('announces generic rejection and loading and prevents repeated actions', async () => {
    const fixture = await render(LoginStage.Rejected);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role=alert]')?.textContent).toContain(LoginStage.Rejected.message);
    fixture.componentRef.setInput('state', { stage: LoginStage.Authenticate, resolution: LoginResolution.Unknown, email: '', password: '', validationMessage: '' }); fixture.detectChanges();
    expect(element.querySelector('[role=status]')).not.toBeNull();
    expect(element.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
    expect(element.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
  });
});
