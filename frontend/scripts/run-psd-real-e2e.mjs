import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import net from 'node:net';
import assert from 'node:assert/strict';
import { databaseEnvironment, query } from './ua-real-database.mjs';
import { ShowcaseConfig, ShowcaseLoader, ShowcaseDiscountKind, ShowcaseAdapterMode,
  ShowcaseExternalCapability, ShowcaseCapabilityState } from './showcase/load-storecore-showcase.mjs';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jar = resolve(frontend, '../backend/target/storecore-backend-0.1.0-SNAPSHOT.jar');
const results = join(frontend, 'psd-real-results');
const httpOrigin = 'http://localhost:4301';
const httpsOrigin = 'https://localhost:4301';
const fixturePassword = 'PSD-disposable-fixture-2026!';
const adminEmail = 'psd-admin@storecore.invalid';
const children = new Set();
const logs = [];
process.env = databaseEnvironment();
const scratch = mkdtempSync(join(tmpdir(), 'storecore-psd-e2e-'));
mkdirSync(results, { recursive: true });

function start(command, args, name, env = process.env) {
  const log = createWriteStream(join(results, `${name}.log`)); logs.push(log);
  const child = spawn(command, args, { cwd: frontend, env, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.on('error', error => log.write(`${error.message}\n`));
  children.add(child); child.on('exit', () => children.delete(child));
  return child;
}
function terminate(child, signal = 'SIGTERM') {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'],
    { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
  else { try { process.kill(-child.pid, signal); } catch { child.kill(signal); } }
}
async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolveExit => child.once('exit', resolveExit));
  terminate(child); const force = setTimeout(() => terminate(child, 'SIGKILL'), 10_000);
  await done; clearTimeout(force);
}
async function ready(child, url, secure = false) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) throw new Error(`Server failed: ${url}; inspect psd-real-results`);
    try {
      const okay = secure ? await new Promise(resolveResponse => {
        const req = https.get(url, { rejectUnauthorized: false, timeout: 2000 }, response => {
          response.resume(); resolveResponse(response.statusCode === 200);
        }); req.on('error', () => resolveResponse(false)); req.on('timeout', () => req.destroy());
      }) : (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
      if (okay) return;
    } catch { /* Bounded startup only. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Readiness timed out: ${url}`);
}
function spring(origin, guard, name) {
  return start(process.env.STORECORE_UA_JAVA ?? 'java', ['-jar', jar,
    '--server.address=127.0.0.1', '--server.port=8080', `--storecore.installation-guard.enabled=${guard}`,
    '--storecore.integrations.mp-orders.adapter=unconfigured'], name, { ...process.env,
    STORECORE_DB_URL: `jdbc:postgresql://${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`,
    STORECORE_DB_USERNAME: process.env.PGUSER, STORECORE_DB_PASSWORD: process.env.PGPASSWORD,
    STORECORE_INSTALLATION_ORIGIN: origin });
}
async function run() {
  if (!existsSync(jar)) throw new Error('Build backend first: mvn -B -DskipTests package');
  if (!existsSync(join(frontend, 'dist/storecore-demo/browser/index.html'))) throw new Error('Build Demo first: npm run build:demo');
  const version = Number(query("SELECT current_setting('server_version_num');"));
  if (version < 160000 || version >= 170000) throw new Error('PSD requires PostgreSQL 16');
  if (query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public';") !== '0') throw new Error('PSD requires a fresh empty storecore_ua_e2e database; no automatic deletion');
  for (const [port, host] of [[8080, '127.0.0.1'], [4301, 'localhost'], [4390, '127.0.0.1']]) {
    const server = net.createServer();
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, host, accept); });
    await new Promise(accept => server.close(accept));
  }
  const certificate = join(scratch, 'localhost.crt'); const key = join(scratch, 'localhost.key');
  const cert = spawnSync(process.env.STORECORE_UA_OPENSSL ?? 'openssl', ['req', '-x509', '-newkey', 'rsa:2048',
    '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'],
  { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  if (cert.error) throw cert.error;
  if (cert.status !== 0) throw new Error('Disposable certificate creation failed');
  const provision = spring(httpOrigin, false, 'backend-provision');
  await ready(provision, 'http://127.0.0.1:8080/actuator/health');
  const registration = await fetch('http://127.0.0.1:8080/api/v1/customer/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: httpOrigin },
    body: JSON.stringify({ email: 'psd-hash@storecore.invalid', password: fixturePassword, firstName: 'PSD', lastName: 'Hash' }) });
  assert.equal(registration.status, 201);
  query(`BEGIN;
    INSERT INTO installation_settings(installation_id,business_name,allowed_host) VALUES(1,'PSD disposable fixture','localhost');
    INSERT INTO users(email,password_hash,first_name,last_name)
      SELECT '${adminEmail}',password_hash,'PSD','Admin' FROM customers WHERE email='psd-hash@storecore.invalid';
    INSERT INTO users(email,password_hash,first_name,last_name)
      SELECT 'psd-operator@storecore.invalid',password_hash,'PSD','Operator' FROM customers WHERE email='psd-hash@storecore.invalid';
    INSERT INTO users(email,password_hash,first_name,last_name)
      SELECT 'psd-browser-admin@storecore.invalid',password_hash,'PSD','Browser' FROM customers WHERE email='psd-hash@storecore.invalid';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='ADMIN' WHERE u.email='${adminEmail}';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='OPERATOR' WHERE u.email='psd-operator@storecore.invalid';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='ADMIN' WHERE u.email='psd-browser-admin@storecore.invalid';
    COMMIT;`);
  await stop(provision);
  const loading = spring(httpOrigin, true, 'backend-loader');
  await ready(loading, 'http://127.0.0.1:8080/actuator/health');
  const config = new ShowcaseConfig({ baseUrl: 'http://127.0.0.1:8080', origin: httpOrigin,
    adminEmail, adminPassword: fixturePassword, includePendingOrder: true });
  const first = new ShowcaseLoader(config);
  assert.equal((await first.run()).pendingOrderCreated, true);
  const unrelated = await first.context.admin.request('/api/v1/user/offers', {
    method: 'POST', csrf: true, expected: [201], envelopeCode: 200,
    body: { name: 'PSD_OPERATOR_OWNED', priority: 7, startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(), discountKind: ShowcaseDiscountKind.Percent.wire,
      discountValue: 3, minMarginPercent: 0, skus: ['SHOW-SET-MANUAL'] } });
  const historical = query("SELECT count(*) FROM orders;");
  const balances = query('SELECT row_to_json(b)::text FROM inventory_balances b ORDER BY variant_id;');
  assert.equal((await new ShowcaseLoader(config).run()).pendingOrderCreated, false);
  assert.equal(query('SELECT count(*) FROM orders;'), historical);
  assert.equal(query('SELECT row_to_json(b)::text FROM inventory_balances b ORDER BY variant_id;'), balances);
  const replayOffers = await first.context.admin.request('/api/v1/user/offers');
  assert.deepEqual(replayOffers.find(offer => offer.id === unrelated.id), unrelated);
  await stop(loading);
  const backend = spring(httpsOrigin, true, 'backend-browser');
  await ready(backend, 'http://127.0.0.1:8080/actuator/health');
  // Authenticate independently under the new exact Origin. ShowcaseConfig stays HTTP-only.
  const browserAdmin = await fetch('http://127.0.0.1:8080/api/v1/internal/auth/login', {
    method: 'POST', headers: { Origin: httpsOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: fixturePassword }) });
  assert.equal(browserAdmin.status, 200);
  const browserCookie = browserAdmin.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(browserCookie);
  const safetyRead = await fetch('http://127.0.0.1:8080/api/v1/user/showcase-safety', {
    headers: { Cookie: browserCookie, Origin: httpsOrigin } });
  assert.equal(safetyRead.status, 200);
  const safety = (await safetyRead.json()).data;
  assert.equal(ShowcaseAdapterMode.fromWire(safety.mpOrdersAdapter), ShowcaseAdapterMode.Unconfigured);
  assert.equal(safety.externalCheckoutDisabled, true);
  const capabilities = safety.externalCapabilities;
  assert.ok(Array.isArray(capabilities));
  for (const capability of ShowcaseExternalCapability.values) {
    assert.equal(ShowcaseCapabilityState.fromWire(capabilities.find(row =>
      ShowcaseExternalCapability.fromWire(row.module) === capability)?.state), ShowcaseCapabilityState.Disabled);
  }
  const angular = start(process.execPath, [join(frontend, 'node_modules/@angular/cli/bin/ng.js'), 'serve',
    '--configuration', 'production', '--host', 'localhost', '--port', '4301', '--ssl', '--ssl-cert', certificate,
    '--ssl-key', key, '--proxy-config', 'proxy.ua-real.conf.json'], 'angular');
  await ready(angular, `${httpsOrigin}/login`, true);
  const demo = start(process.execPath, ['demo-e2e/serve.mjs'], 'demo');
  await ready(demo, 'http://127.0.0.1:4390/demo');
  const playwright = start(process.execPath, [join(frontend, 'node_modules/@playwright/test/cli.js'),
    'test', '--config', 'playwright.psd-real.config.ts'], 'playwright');
  process.exitCode = await new Promise((accept, reject) => {
    playwright.once('error', reject); playwright.once('exit', code => accept(code ?? 1));
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const child of children) terminate(child); process.exitCode = 1;
});
try { await run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await Promise.all([...children].map(stop));
  await Promise.all(logs.map(log => new Promise(accept => log.end(accept))));
  rmSync(scratch, { recursive: true, force: true });
}
