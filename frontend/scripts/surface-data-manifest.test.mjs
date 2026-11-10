import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(frontendRoot, '..');
const manifestPath = resolve(repoRoot, 'sdd/features/20261108-storecore-productive-surface-data-parity/1-functional/surface-data-manifest.json');
const identityPath = resolve(frontendRoot, 'src/app/domain/navigation/surface-identity.ts');
const routesPath = resolve(frontendRoot, 'src/app/app.routes.ts');
const loaderPath = resolve(frontendRoot, 'scripts/showcase/load-storecore-showcase.mjs');
const backendRoot = resolve(repoRoot, 'backend/src/main/kotlin');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const identitySource = readFileSync(identityPath, 'utf8');
const routesSource = readFileSync(routesPath, 'utf8');
const loaderSource = readFileSync(loaderPath, 'utf8');

const identityPattern = /new SurfaceIdentity\('(SC-SURF-\d{2})', '([^']*)'(, false)?\)/g;
const identities = [...identitySource.matchAll(identityPattern)].map((match) => ({
  id: match[1],
  route: match[2] ? `/${match[2]}` : '/',
  real: match[3] === undefined,
}));

function filesUnder(directory, suffix) {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path, suffix) : path.endsWith(suffix) ? [path] : [];
  });
}

function normalizedContract(method, path) {
  const normalizedPath = path.replace(/\{[^}]+\}/g, '{}').replace(/\/{2,}/g, '/');
  return `${method.toUpperCase()} ${normalizedPath}`;
}

function controllerContracts() {
  const contracts = new Set();
  for (const file of filesUnder(backendRoot, '.kt')) {
    const source = readFileSync(file, 'utf8');
    const prefix = source.match(/@RequestMapping\("([^"]+)"\)/)?.[1] ?? '';
    for (const line of source.split(/\r?\n/)) {
      const mapping = line.match(/@(Get|Post|Put|Delete|Patch)Mapping(?:\([^"\r\n]*"([^"]*)")?/);
      if (!mapping) continue;
      const path = mapping[2]?.startsWith('/api/') ? mapping[2] : `${prefix}${mapping[2] ?? ''}`;
      if (path.startsWith('/api/v1/')) contracts.add(normalizedContract(mapping[1], path));
    }
  }
  return contracts;
}

test('productive surface manifest covers the closed identity set exactly once', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.states, ['REAL', 'DEMO_ONLY', 'EXTERNAL_BLOCKED', 'NOT_APPLICABLE']);
  assert.equal(identities.length, 26);
  assert.equal(manifest.surfaces.length, 26);
  assert.deepEqual(
    manifest.surfaces.map((surface) => surface.id).sort(),
    identities.map((surface) => surface.id).sort(),
  );
  assert.equal(new Set(manifest.surfaces.map((surface) => surface.id)).size, 26);
});

test('manifest current routes agree with productive SurfaceIdentity ownership', () => {
  const byId = new Map(manifest.surfaces.map((surface) => [surface.id, surface]));
  const routeSegments = new Set([...routesSource.matchAll(/path:\s*'([^']*)'/g)].map((match) => match[1]));
  const controllers = controllerContracts();
  const loaderStages = new Set([...loaderSource.matchAll(/new ShowcaseStage\([^,]+, '([^']+)'/g)].map((match) => match[1]));
  assert.deepEqual(Object.keys(manifest.authorities).sort(), identities.map((identity) => identity.id).sort());
  for (const identity of identities) {
    const surface = byId.get(identity.id);
    assert.ok(surface, `missing ${identity.id}`);
    assert.ok(manifest.states.includes(surface.state), `${identity.id} has unknown state`);
    assert.equal(typeof surface.coverage, 'string', `${identity.id} needs explicit coverage`);
    assert.ok(surface.coverage.length > 0, `${identity.id} needs explicit coverage`);
    assert.ok(Object.hasOwn(surface, 'loaderStage'), `${identity.id} needs loader ownership`);
    assert.equal(typeof manifest.authorities[identity.id], 'string', `${identity.id} needs source authority`);
    assert.ok(manifest.authorities[identity.id].length > 0, `${identity.id} needs source authority`);
    if (identity.real) {
      assert.equal(surface.state, 'REAL', `${identity.id} is productive in code`);
      assert.equal(surface.route, identity.route, `${identity.id} route drift`);
      assert.ok(surface.read.length + surface.writes.length > 0, `${identity.id} needs an owned contract`);
      const relativeRoute = identity.route.slice(1);
      const [root, ...children] = relativeRoute.split('/');
      const represented = routeSegments.has(relativeRoute) ||
        routeSegments.has(root) && routeSegments.has(children.join('/'));
      assert.ok(represented, `${identity.id} is absent from app.routes: ${relativeRoute}`);
    } else {
      assert.notEqual(surface.state, 'REAL', `${identity.id} is not productive in code`);
      assert.equal(surface.route, null, `${identity.id} must not claim a productive route`);
    }
    const needsTarget = surface.state !== 'REAL' || surface.coverage.includes('LIMITED') || surface.coverage.startsWith('PSD-');
    if (needsTarget) {
      const target = manifest.targets[identity.id];
      assert.ok(target, `${identity.id} needs a residual target`);
      assert.match(target.ownerTask, /^(PSD-T\d{2}|EXTERNAL)$/);
      assert.ok(target.operations.length > 0, `${identity.id} needs target operations`);
      assert.ok(target.fields.length > 0, `${identity.id} needs target fields`);
    }
    if (surface.loaderStage !== null) assert.ok(loaderStages.has(surface.loaderStage), `${identity.id} has unknown loader stage`);
    const backendOnlyWrites = surface.backendOnlyWrites ?? [];
    assert.ok(Array.isArray(backendOnlyWrites), `${identity.id} backend-only commands must be an array`);
    for (const contract of backendOnlyWrites) {
      assert.ok(!surface.writes.includes(contract), `${identity.id} command cannot be both UI-reachable and backend-only`);
      assert.match(contract, /^(POST|PUT|DELETE|PATCH) /, `${identity.id} backend-only write needs a mutation method`);
    }
    for (const contract of [...surface.read, ...surface.writes, ...backendOnlyWrites]) {
      assert.match(contract, /^(GET|POST|PUT|DELETE|PATCH) \/api\/v1\//, `${identity.id} has invalid contract ${contract}`);
      assert.ok(controllers.has(normalizedContract(...contract.split(' ', 2))), `${identity.id} contract missing in controllers: ${contract}`);
    }
  }
});

