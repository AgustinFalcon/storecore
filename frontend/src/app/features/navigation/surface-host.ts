import { APP_BOOTSTRAP_LISTENER, ComponentRef, DestroyRef, effect, inject, InjectionToken, Injector, Provider, RendererFactory2, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SurfaceIdentity, SurfaceTarget } from '../../domain/navigation/surface-identity';

export const SURFACE_TARGET = new InjectionToken<SurfaceTarget>('Surface target', { factory: () => SurfaceTarget.Unknown });

export function matchedSurface(root: ActivatedRouteSnapshot, target: SurfaceTarget): SurfaceIdentity {
  const parts: string[] = [];
  let node: ActivatedRouteSnapshot | null = root;
  while (node) {
    if (node.routeConfig?.path) parts.push(node.routeConfig.path);
    node = node.firstChild;
  }
  if (target === SurfaceTarget.Demo && parts[0] === 'demo') parts.shift();
  return SurfaceIdentity.fromMatchedPath(parts.join('/'), target);
}

/** One root host observes both navigation and the live actor, without copying identity into views. */
export function provideSurfaceIdentity(target: SurfaceTarget, actorFactory: () => () => string): Provider[] {
  return [
    { provide: SURFACE_TARGET, useValue: target },
    { provide: APP_BOOTSTRAP_LISTENER, multi: true, useFactory: () => {
      const router = inject(Router);
      const injector = inject(Injector);
      const renderer = inject(RendererFactory2).createRenderer(null, null);
      const actor = actorFactory();
      const revision = signal(0);
      router.events.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(event => {
        if (event instanceof NavigationEnd) revision.update(value => value + 1);
      });
      return (component: ComponentRef<unknown>) => {
        effect(() => {
          revision();
          const surface = matchedSurface(router.routerState.snapshot.root, target);
          const host = component.location.nativeElement;
          renderer.setAttribute(host, 'data-surface-id', surface.wire);
          renderer.setAttribute(host, 'data-surface-target', target.wire);
          renderer.setAttribute(host, 'data-surface-url', surface === SurfaceIdentity.Recovery ? router.url.split(/[?#]/, 1)[0] : router.url);
          renderer.setAttribute(host, 'data-surface-actor', actor());
          renderer.setAttribute(host, 'data-surface-data', target.data);
        }, { injector });
      };
    } },
  ];
}
