import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginStage } from '../../domain/access/login-stage';
import { ReturnDestination } from '../../domain/access/return-destination';
import { LoginViewComponent } from './login.view';

describe('LoginViewComponent purchase continuation links', () => {
  it('preserves only the provided opaque reference on the registration link', () => {
    TestBed.configureTestingModule({ imports: [LoginViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LoginViewComponent);
    fixture.componentRef.setInput('state', { stage: LoginStage.CollectCredentials, email: '', password: '', busy: false, contexts: [], message: '' });
    fixture.componentRef.setInput('destination', ReturnDestination.Catalog);
    fixture.componentRef.setInput('resume', 'opaque-flow');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('a[href^="/customer/register"]')?.getAttribute('href')).toBe('/customer/register?returnTo=CATALOG&resume=opaque-flow');
    fixture.componentRef.setInput('resume', null); fixture.detectChanges();
    expect(host.querySelector('a[href^="/customer/register"]')?.getAttribute('href')).toBe('/customer/register?returnTo=CATALOG');
  });
});
