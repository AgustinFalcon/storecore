import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadTs(relative) {
  const filename = require.resolve(relative);
  const module = { exports: {} };
  const localRequire = createRequire(filename);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const importModule = name => name === '@playwright/test'
    ? { expect: require(name).expect.configure({ timeout: 100 }) }
    : name.endsWith('api-error-code') ? loadTs('../src/app/core/api/api-error-code.ts') : localRequire(name);
  new Function('require', 'module', 'exports', source)(importModule, module, module.exports);
  return module.exports;
}
const { RealReadTrace, RealReadRequirement, RealReadExpectation, RealReadTerminal, RealReadFailure } = loadTs('../e2e-psd-real/route-matrix-support.ts');
const { ApiErrorCode } = loadTs('../src/app/core/api/api-error-code.ts');
const required = ['health', 'storefront/branding', 'catalog'];
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const page = new EventEmitter();
  const trace = new RealReadTrace(page);
  const read = (path, { status = 200, failed = false, pending = false, code, body = null, method = 'GET' } = {}) => {
    const request = { url: () => `https://localhost/api/v1/${path}`, method: () => method, postData: () => body,
      failure: () => failed ? { errorText: 'net::ERR_ABORTED' } : null };
    page.emit('request', request);
    page.emit('response', { request: () => request, status: () => status, json: async () => ({ errorCode: code }) });
    if (!pending) page.emit(failed ? 'requestfailed' : 'requestfinished', request);
  };
  read('health'); read('storefront/branding');
  return { trace, read };
}

test('closed read expectations and terminal states reject unknown wires', () => {
  for (const value of [RealReadExpectation.Data, RealReadExpectation.CapabilityDisabled]) assert.equal(RealReadExpectation.fromWire(value.wire), value);
  for (const value of [RealReadTerminal.Pending, RealReadTerminal.Finished, RealReadTerminal.Failed]) assert.equal(RealReadTerminal.fromWire(value.wire), value);
  assert.equal(RealReadExpectation.fromWire('future'), RealReadExpectation.Unknown);
  assert.equal(RealReadTerminal.fromWire('future'), RealReadTerminal.Unknown);
  assert.equal(RealReadFailure.fromTransport('net::ERR_ABORTED'), RealReadFailure.Aborted);
  assert.equal(RealReadFailure.fromTransport('net::ERR_CONNECTION_RESET'), RealReadFailure.Connection);
  assert.equal(RealReadFailure.fromTransport('PRIVATE_BROWSER_DETAIL'), RealReadFailure.Unknown);
  assert.throws(() => RealReadRequirement.disabled('catalog'));
});

test('an interrupted response never satisfies a required data read', async () => {
  const { trace, read } = fixture(); read('catalog', { failed: true }); await flush();
  await assert.rejects(trace.ready(required));
});

test('only a later identical finished read replaces a failed read', async () => {
  for (const mode of ['earlier', 'query', 'body', 'later']) {
    const { trace, read } = fixture();
    const path = mode === 'body' ? 'customer/auth/recovery/inspect' : 'catalog';
    if (mode === 'earlier') read(path);
    read(path, { failed: true, body: mode === 'body' ? 'secret-A' : null, method: mode === 'body' ? 'POST' : 'GET' });
    if (mode !== 'earlier') read(mode === 'query' ? `${path}?query=different` : path,
      { body: mode === 'body' ? 'secret-B' : null, method: mode === 'body' ? 'POST' : 'GET' });
    await flush();
    const ready = trace.ready(['health', 'storefront/branding', path]);
    if (mode === 'later') await ready; else await assert.rejects(ready);
  }
});

test('interrupted HTTP errors remain unexpected even after a finished replacement', async () => {
  for (const status of [403, 500]) {
    const { trace, read } = fixture(); read('catalog', { status, failed: true }); read('catalog'); await flush();
    await assert.rejects(trace.ready(required));
  }
});

test('only both completed typed ML denials satisfy the disabled route', async () => {
  const paths = ['user/mercadolibre/account', 'user/mercadolibre/listings'];
  for (const valid of [true, false]) {
    const { trace, read } = fixture();
    for (const path of paths) read(path, { status: 409, code: valid ? ApiErrorCode.CapabilityDisabled.wire : 'OTHER_CONFLICT' });
    await flush();
    const ready = trace.ready(['health', 'storefront/branding', ...paths.map(path => RealReadRequirement.disabled(path))]);
    if (valid) await ready; else await assert.rejects(ready);
  }
});

test('an interrupted untyped ML conflict cannot be hidden by a later typed denial', async () => {
  const { trace, read } = fixture();
  const paths = ['user/mercadolibre/account', 'user/mercadolibre/listings'];
  read(paths[0], { status: 409, code: 'OTHER_CONFLICT', failed: true });
  read(paths[0], { status: 409, code: ApiErrorCode.CapabilityDisabled.wire });
  read(paths[1], { status: 409, code: ApiErrorCode.CapabilityDisabled.wire });
  await flush();
  await assert.rejects(trace.ready(['health', 'storefront/branding', ...paths.map(path => RealReadRequirement.disabled(path))]));
});

test('failure diagnostics exclude query, fragment, body and full request identity', async () => {
  const { trace, read } = fixture();
  read('catalog?token=PRIVATE_QUERY', { body: 'PRIVATE_BODY', method: 'POST', pending: true });
  read('customer/me', { status: 401, failed: true });
  await flush();
  const snapshot = trace.snapshot('https://localhost/customer/profile?secret=PRIVATE_QUERY#PRIVATE_FRAGMENT');
  assert.equal(snapshot.finalPath, '/customer/profile');
  assert.deepEqual(snapshot.requests.slice(-2), [
    { method: 'POST', path: '/api/v1/catalog', status: 200, terminal: RealReadTerminal.Pending.wire, failure: null },
    { method: 'GET', path: '/api/v1/customer/me', status: 401, terminal: RealReadTerminal.Failed.wire,
      failure: RealReadFailure.Aborted.wire },
  ]);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE_'), false);
  assert.equal(JSON.stringify(snapshot).includes('identity'), false);
});
