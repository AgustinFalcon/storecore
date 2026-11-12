import { APP_BOOTSTRAP_LISTENER, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { SurfaceIdentity, SurfaceTarget } from '../../domain/navigation/surface-identity';
import { NotFoundComponent } from './not-found.component';
import { provideSurfaceIdentity } from './surface-host';

@Component({ template: '<h1>Surface</h1>' }) class SurfaceStub {}
@Component({ imports: [RouterOutlet], template: '<main><router-outlet/></main>' }) class RootStub {}

describe('route host identity and Not Found', () => {
  it('never publishes email verification tokens or query values on the observable host', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'verify-email', component: SurfaceStub }]), ...provideSurfaceIdentity(SurfaceTarget.Real, () => () => 'public')] });
    const fixture = TestBed.createComponent(RootStub);
    for (const listener of TestBed.inject(APP_BOOTSTRAP_LISTENER)) listener(fixture.componentRef);
    await TestBed.inject(Router).navigateByUrl('/verify-email?private=value#realm=user&token=secret'); fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('data-surface-id')).toBe(SurfaceIdentity.EmailVerification.wire);
    expect(fixture.nativeElement.getAttribute('data-surface-url')).toBe('/verify-email');
  });
  it('never publishes the password recovery fragment or query on the observable host', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'reset-password', component: SurfaceStub }]), ...provideSurfaceIdentity(SurfaceTarget.Real, () => () => 'public')] });
    const fixture = TestBed.createComponent(RootStub);
    for (const listener of TestBed.inject(APP_BOOTSTRAP_LISTENER)) listener(fixture.componentRef);
    await TestBed.inject(Router).navigateByUrl('/reset-password#realm=customer&token=secret'); fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('data-surface-id')).toBe(SurfaceIdentity.Recovery.wire);
    expect(fixture.nativeElement.getAttribute('data-surface-url')).toBe('/reset-password');
  });
  it('publishes one live host identity, URL, actor and source; entity misses keep their surface', async () => {
    const actor = signal('public');
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'demo', children: [
        { path: 'catalog/:sku', component: SurfaceStub },
        { path: '**', component: NotFoundComponent },
      ] }]),
      ...provideSurfaceIdentity(SurfaceTarget.Demo, () => () => actor()),
    ] });
    const fixture = TestBed.createComponent(RootStub);
    for (const listener of TestBed.inject(APP_BOOTSTRAP_LISTENER)) listener(fixture.componentRef);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/demo/catalog/missing?from=catalog');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-surface-id')).toBe(SurfaceIdentity.Product.wire);
    expect(host.getAttribute('data-surface-url')).toBe(router.url);
    expect(host.getAttribute('data-surface-data')).toBe(SurfaceTarget.Demo.data);
    actor.set('customer:actor-2');
    fixture.detectChanges();
    expect(host.getAttribute('data-surface-actor')).toBe('customer:actor-2');
    await router.navigateByUrl('/demo/user/no-existe/anidado?query=kept');
    fixture.detectChanges();
    expect(router.url).toBe('/demo/user/no-existe/anidado?query=kept');
    expect(host.getAttribute('data-surface-id')).toBe(SurfaceIdentity.Unknown.wire);
    expect(host.querySelectorAll('[data-surface-id]')).toHaveLength(0);
    expect(host.querySelector('h1')?.textContent).toBe('Página no encontrada');
    expect(host.querySelector('[data-cta="not-found-context"]')?.getAttribute('href')).toBe('/demo/user/home');
    await router.navigateByUrl('/demo/customer/unknown/other');
    fixture.detectChanges();
    expect(host.querySelector('[data-cta="not-found-context"]')?.getAttribute('href')).toBe('/demo/customer/orders');
  });
});
