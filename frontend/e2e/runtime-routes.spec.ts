import { expect, test } from '@playwright/test';
import { leafPathsFromSource } from './runtime-routes';

test('component routes with empty children are counted as leaves', () => {
  expect(leafPathsFromSource(`export const routes = [
    { path: '', component: Shell, children: [
      { path: 'new-screen', component: Screen, children: [] },
      { path: 'other', component: Screen },
    ] },
  ];`)).toEqual(['/new-screen', '/other']);
});

test('lazy routes fail inventory reconciliation even alongside empty children', () => {
  for (const loader of ['loadChildren', 'loadComponent']) {
    for (const children of ['', ', children: []']) {
      expect(() => leafPathsFromSource(`export const routes = [
        { path: 'lazy', ${loader}: () => import('./lazy')${children} },
      ];`)).toThrow('Lazy route topology is unsupported');
    }
  }
});

test('unsupported children and spread routes cannot disappear from the inventory', () => {
  expect(() => leafPathsFromSource(`export const routes = [{ path: '', component: Shell, children: extra }];`))
    .toThrow('Route children must be an explicit array');
  expect(() => leafPathsFromSource(`export const routes = [...extra];`))
    .toThrow('Unsupported route entry');
});
