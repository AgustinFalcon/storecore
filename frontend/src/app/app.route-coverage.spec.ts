import { Route } from '@angular/router';
import { routes } from './app.routes';
import {
  productiveRedirectManifest,
  productiveRouteManifest,
  productiveWildcardManifest,
  RouteActor,
  RouteEvidenceMode,
  RouteScenario,
} from './features/navigation/productive-route-manifest';

interface RouteCensus {
  readonly leaves: string[];
  readonly redirects: Map<string, string>;
  readonly wildcards: string[];
}

function join(parent: string, child: string): string {
  return [parent, child].filter(Boolean).join('/');
}

function census(tree: readonly Route[], parent = '', result: RouteCensus = { leaves: [], redirects: new Map(), wildcards: [] }): RouteCensus {
  for (const entry of tree) {
    const own = entry.path ?? '';
    const pattern = join(parent, own);
    if (own === '**') {
      result.wildcards.push(pattern || '**');
      continue;
    }
    if (entry.redirectTo !== undefined) {
      result.redirects.set(pattern.endsWith('/') ? pattern : `${pattern}${own === '' ? '/' : ''}`, typeof entry.redirectTo === 'string' ? entry.redirectTo : 'redirect-function');
      continue;
    }
    if (entry.loadChildren) throw new Error(`El censo productivo no admite loadChildren sin resolver: ${pattern || '/'}.`);
    if (entry.children) census(entry.children, pattern, result);
    else if (entry.component || entry.loadComponent) result.leaves.push(pattern);
  }
  return result;
}

describe('productive route acceptance manifest', () => {
  it('reconciles every concrete leaf, redirect and wildcard without a historical count', () => {
    const actual = census(routes);
    const declaredLeaves = productiveRouteManifest.map(entry => entry.pattern);
    expect(new Set(declaredLeaves).size).toBe(declaredLeaves.length);
    expect([...declaredLeaves].sort()).toEqual([...actual.leaves].sort());
    expect([...productiveRedirectManifest.entries()].sort()).toEqual([...actual.redirects.entries()].sort());
    expect([...productiveWildcardManifest].sort()).toEqual([...actual.wildcards].sort());
  });

  it('keeps closed metadata and a navigable fixture for each concrete route', () => {
    for (const entry of productiveRouteManifest) {
      expect(RouteActor.fromWire(entry.actor.wire)).toBe(entry.actor);
      expect(RouteScenario.fromWire(entry.scenario.wire)).toBe(entry.scenario);
      expect(RouteEvidenceMode.fromWire(entry.evidence.wire)).toBe(RouteEvidenceMode.HttpFixture);
      expect(entry.surface.path === entry.pattern || (entry.pattern === 'reset-password' && entry.surface.path === 'recover')).toBe(true);
      expect(entry.url.startsWith('/')).toBe(true);
      expect(entry.heading).not.toBe('');
      expect(entry.readiness).not.toBe('');
    }
    expect(RouteActor.fromWire('FUTURE')).toBe(RouteActor.Unknown);
    expect(RouteScenario.fromWire('FUTURE')).toBe(RouteScenario.Unknown);
    expect(RouteEvidenceMode.fromWire('FUTURE')).toBe(RouteEvidenceMode.Unknown);
  });

  it('fails closed when a lazy child tree cannot be inspected synchronously', () => {
    const unsupported: Route[] = [{ path: 'future', loadChildren: async () => [] }];
    expect(() => census(unsupported)).toThrowError(/loadChildren/);
  });
});
