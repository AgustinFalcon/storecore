import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainBoundaryFailures as check } from './domain-boundary.mjs';

test('root domain and Windows paths cover every source category', () => {
  for (const file of ['domain/a.entity.ts', 'domain/a.repository.ts', 'domain/a.ts',
    'domain/a/use-cases/a.usecase.ts', 'domain/a/use-cases/a.usecase.spec.ts', 'domain\\a\\a.port.ts']) {
    assert.equal(check(file, "import { Injectable } from '@angular/core';").length, 1, file);
  }
});

test('framework imports, reexports, import types and dynamic imports fail', () => {
  for (const text of ["import type { Type } from '@angular/core';", "export { A } from '@ngrx/store';",
    "type A = import('@angular/core').Type;", "const a = import('@angular/common/http');",
    "const a = require('@ngrx/component-store');", "import A = require('@angular/core');",
    "const a = import(moduleName);"]) {
    assert.equal(check('domain/a.ts', text).length, 1, text);
  }
});

test('outward imports and unapproved aliases cannot hide transitive framework dependencies', () => {
  for (const layer of ['core/auth/session', 'core/tokens/a', 'data/a', 'features/a', 'shared/a']) {
    assert.equal(check('domain/a/use-cases/a.ts', `import { A } from '../../../${layer}';`).length, 1);
  }
  assert.equal(check('domain/a.ts', "import { A } from '@app/core/a';").length, 1);
});

test('domain-relative and RxJS imports pass without comment or string false positives', () => {
  assert.deepEqual(check('domain/a/use-cases/a.ts', "import { A } from '../a.repository'; import { B } from '../../b/b'; import { of } from 'rxjs'; import { map } from 'rxjs/operators';"), []);
  assert.deepEqual(check('domain/a.ts', "// import { A } from '@angular/core';\nconst description = '@ngrx/store';"), []);
  assert.deepEqual(check('core/a.ts', "import { signal } from '@angular/core';"), []);
});

test('triple-slash type and file references cannot bypass the domain boundary', () => {
  for (const types of ['@angular/core', '@ngrx/store', '@app/core/session']) {
    assert.equal(check('domain/a.ts', `/// <reference types="${types}" />`).length, 1);
  }
  for (const file of ['../../../core/auth/user-session.ts', '../../../data/a.ts',
    '../../../features/a.ts', '../../../shared/a.ts', 'C:/outside/a.ts', '/core/a.ts']) {
    assert.equal(check('domain/user/use-cases/a.ts', `/// <reference path="${file}" />`).length, 1);
  }
  assert.equal(check('domain\\user\\use-cases\\a.ts', '/// <reference path="..\\..\\..\\core\\auth\\user-session.ts" />').length, 1);
});

test('local domain references and allowed RxJS types remain valid', () => {
  assert.deepEqual(check('domain/user/use-cases/a.ts', '/// <reference path="../user.repository.ts" />\n/// <reference path="local.ts" />\n/// <reference types="rxjs" />'), []);
  assert.deepEqual(check('domain/a.ts', '/* /// <reference types="@angular/core" /> */'), []);
  assert.deepEqual(check('core/a.ts', '/// <reference types="@angular/core" />'), []);
});

import { fixtureLaneFailures as fixtures } from './domain-boundary.mjs';
test('contractual Universal Tools fixture is Demo only; store_id remains forbidden everywhere',()=>{
 for(const path of ['features/a.ts','domain/a.ts','data/a.ts'])for(const source of ["const name='universal-tools-profile';",'class FixtureRepository {}','class InMemoryRepository {}'])assert.equal(fixtures(path,source).length,1);
 for(const path of ['demo/profile/profile-domain.ts','demo/a.spec.ts','demo\\profile\\a.ts'])assert.deepEqual(fixtures(path,"const name='universal-tools-profile'; class FixtureRepository {}"),[]);
 for(const path of ['demo/a.ts','data/a.ts'])assert.equal(fixtures(path,"const x={store_id:'x'};").length,1);
 for(const source of ["import { A } from '../../demo/a';","export { A } from '../../demo/a';","const a=import('../../demo/a');","type A=import('../../demo/a').A;"])assert.equal(fixtures('features/admin/a.ts',source).length,1);
 assert.deepEqual(fixtures('demo/profile/a.ts',"import { A } from '../../domain/a';"),[]);
});
