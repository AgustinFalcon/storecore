import type { Route } from '@angular/router';
import { SurfaceIdentity } from '../../domain/navigation/surface-identity';
import {
  ProductiveRouteAcceptance, ProductiveRouteDefinition, RouteActionClass,
  RouteActor, RouteEvidenceMode, RouteScenario,
} from './productive-route-manifest';

export interface ProductiveRouteCensus {
  readonly leaves: readonly string[];
  readonly redirects: readonly (readonly [string, string])[];
  readonly wildcards: readonly string[];
}

export function censusProductiveRoutes(tree: readonly Route[], parent = ''): ProductiveRouteCensus {
  const leaves: string[] = [], redirects: (readonly [string, string])[] = [], wildcards: string[] = [];
  for (const entry of tree) {
    const own = entry.path ?? '';
    const pattern = [parent, own].filter(Boolean).join('/');
    if (entry.loadChildren) throw new Error(`Unsupported loadChildren: ${pattern}`);
    if (own === '**') wildcards.push(pattern);
    else if (entry.redirectTo !== undefined) redirects.push([`${pattern}${own === '' ? '/' : ''}`,
      typeof entry.redirectTo === 'string' ? entry.redirectTo : 'redirect-function']);
    else if (entry.children) {
      const nested = censusProductiveRoutes(entry.children, pattern);
      leaves.push(...nested.leaves); redirects.push(...nested.redirects); wildcards.push(...nested.wildcards);
    } else if (entry.component || entry.loadComponent) leaves.push(pattern);
  }
  return { leaves, redirects, wildcards };
}

function sameSet(actual: readonly string[], declared: readonly string[]): void {
  if (new Set(actual).size !== actual.length || new Set(declared).size !== declared.length ||
      actual.length !== declared.length || actual.some(value => !declared.includes(value))) {
    throw new Error('Missing, duplicate or orphan productive route');
  }
}

/** Both evidence sources must cover the exact canonical tree; unknown metadata fails closed. */
export function assertProductiveRouteCoverage(
  tree: readonly Route[], definitions: readonly ProductiveRouteDefinition[],
  http: readonly ProductiveRouteAcceptance[], real: readonly ProductiveRouteAcceptance[],
  redirects: readonly (readonly [string, string])[], wildcards: readonly string[],
): void {
  const actual = censusProductiveRoutes(tree);
  sameSet(actual.leaves, definitions.map(entry => entry.pattern));
  sameSet(actual.redirects.map(entry => entry[0]), redirects.map(entry => entry[0]));
  sameSet(actual.redirects.map(entry => JSON.stringify(entry)), redirects.map(entry => JSON.stringify(entry)));
  sameSet(actual.wildcards, wildcards);
  for (const entry of definitions) {
    if (entry.actor === RouteActor.Unknown || entry.scenario === RouteScenario.Unknown ||
        entry.requirement === RouteActionClass.Unknown || entry.surface === SurfaceIdentity.Unknown) {
      throw new Error('Unknown productive route metadata');
    }
  }
  for (const [bindings, source] of [[http, RouteEvidenceMode.HttpFixture], [real, RouteEvidenceMode.RealBackend]] as const) {
    sameSet(actual.leaves, bindings.map(entry => entry.pattern));
    for (const entry of bindings) {
      const definition = definitions.find(item => item.pattern === entry.pattern);
      if (!definition || entry.surface !== definition.surface || entry.actor !== definition.actor ||
          entry.scenario !== definition.scenario || entry.requirement !== definition.requirement ||
          entry.evidence !== source || !entry.url.startsWith('/') || entry.url.startsWith('//') ||
          !entry.finalUrl.startsWith('/') || entry.finalUrl.startsWith('//') || !entry.heading || !entry.readiness) {
        throw new Error('Invalid productive route binding');
      }
    }
  }
}
