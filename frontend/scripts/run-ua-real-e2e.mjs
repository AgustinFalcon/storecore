import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { databaseEnvironment, query } from './ua-real-database.mjs';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(frontend, '../backend');
const results = join(frontend, 'ua-real-results');
const jar = join(backend, 'target/storecore-backend-0.1.0-SNAPSHOT.jar');
const origin = 'https://localhost:4301';
const children = new Set();
const logs = [];
process.env = databaseEnvironment();
const scratch = mkdtempSync(join(tmpdir(), 'storecore-ua-e2e-'));
mkdirSync(results, { recursive: true });

function start(command, args, name, env = process.env) {
  const log = createWriteStream(join(results, `${name}.log`));
  logs.push(log);
  const child = spawn(command, args, { cwd: frontend, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.on('error', (error) => { log.write(`${error.message}\n`); });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}
function terminate(child, signal) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    // Only this runner's known child PID and its descendants are targeted.
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
  } else {
    try { process.kill(-child.pid, signal); } catch { child.kill(signal); }
  }
}
async function stop(child) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((resolveExit) => child.once('exit', resolveExit));
  terminate(child, 'SIGTERM');
  const force = setTimeout(() => terminate(child, 'SIGKILL'), 10_000);
  await done; clearTimeout(force);
}
async function ready(child, url, secure = false) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) throw new Error(`Server failed: ${url}; inspect ua-real-results logs`);
    try {
      const okay = secure ? await new Promise((resolveResponse) => {
        const request = https.get(url, { rejectUnauthorized: false, timeout: 2000 }, (response) => {
          response.resume(); resolveResponse(response.statusCode === 200);
        });
        request.on('error', () => resolveResponse(false));
        request.on('timeout', () => request.destroy());
      }) : (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
      if (okay) return;
    } catch { /* Startup is bounded and failed processes are checked above. */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Readiness timed out: ${url}`);
}
function spring(guard, name) {
  return start(process.env.STORECORE_UA_JAVA ?? 'java', ['-jar', jar,
    '--server.address=127.0.0.1', '--server.port=8080', `--storecore.installation-guard.enabled=${guard}`,
    '--storecore.integrations.refetch-delay-ms=500',
    '--storecore.integrations.mp-orders.adapter=official',
    '--storecore.integrations.mp-orders.accepted-topic=order',
    '--storecore.integrations.mp-orders.expected-user-id=cfe-user',
    '--storecore.integrations.mp-orders.expected-application-id=cfe-app',
    '--storecore.integrations.mp-orders.checkout-url-hosts[0]=provider.example.test',
    '--storecore.integrations.mp-orders.api-base-url=http://127.0.0.1:4302',
    '--storecore.integrations.mp-orders.access-token-ref=CFE_LOCAL_PROVIDER_TOKEN',
    '--storecore.integrations.mp-orders.webhook-secret-ref=CFE_LOCAL_WEBHOOK_SECRET'], name, {
    ...process.env,
    STORECORE_DB_URL: `jdbc:postgresql://${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`,
    STORECORE_DB_USERNAME: process.env.PGUSER, STORECORE_DB_PASSWORD: process.env.PGPASSWORD,
    STORECORE_INSTALLATION_ORIGIN: origin,
    CFE_LOCAL_PROVIDER_TOKEN: 'cfe-local-provider-token',
    CFE_LOCAL_WEBHOOK_SECRET: 'cfe-local-webhook-secret',
  });
}
async function run() {
  if (!existsSync(jar)) throw new Error('Build backend first: cd backend && mvn -B -DskipTests package');
  if (query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public';") !== '0') {
    throw new Error('UA E2E requires a fresh empty storecore_ua_e2e database; no automatic deletion is performed');
  }
  // Never attach to an unrelated running service or reuse its authority.
  for (const port of [8080, 4301, 4302]) {
    const net = await import('node:net');
    const server = net.createServer();
    await new Promise((resolveBind, rejectBind) => {
      server.once('error', rejectBind); server.listen(port, port === 4301 ? 'localhost' : '127.0.0.1', resolveBind);
    });
    await new Promise((resolveClose) => server.close(resolveClose));
  }
  const certificate = join(scratch, 'localhost.crt');
  const key = join(scratch, 'localhost.key');
  const cert = spawnSync(process.env.STORECORE_UA_OPENSSL ?? 'openssl', ['req', '-x509', '-newkey', 'rsa:2048',
    '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost'], { encoding: 'utf8', timeout: 30_000 });
  if (cert.error) throw cert.error;
  if (cert.status !== 0) throw new Error(`Test certificate creation failed: ${cert.stderr}`);
  const provider = start(process.execPath, [join(frontend, 'scripts/cfe-official-provider.mjs')], 'cfe-provider');
  await ready(provider, 'http://127.0.0.1:4302/health');
  const migrationServer = spring(false, 'backend-provision');
  await ready(migrationServer, 'http://127.0.0.1:8080/actuator/health');
  const registered = await fetch('http://127.0.0.1:8080/api/v1/customer/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: 'ua-hash-source@example.test', password: 'ua-fixture-password-2026', firstName: 'UA', lastName: 'Hash' }),
  });
  if (registered.status !== 201) throw new Error(`Fixture registration failed (${registered.status})`);
  query(readFileSync(join(frontend, 'e2e-real/fixtures/identities.sql'), 'utf8'));
  await stop(migrationServer);
  const backendServer = spring(true, 'backend');
  await ready(backendServer, 'http://127.0.0.1:8080/actuator/health');
  const angular = start(process.execPath, [join(frontend, 'node_modules/@angular/cli/bin/ng.js'), 'serve',
    '--host', 'localhost', '--port', '4301', '--ssl', '--ssl-cert', certificate, '--ssl-key', key,
    '--proxy-config', 'proxy.ua-real.conf.json'], 'angular');
  await ready(angular, `${origin}/login`, true);
  const playwright = spawn(process.execPath, [join(frontend, 'node_modules/@playwright/test/cli.js'),
    'test', '--config', 'playwright.ua-real.config.ts'], { cwd: frontend, env: process.env, detached: process.platform !== 'win32', stdio: 'inherit' });
  children.add(playwright);
  const code = await new Promise((resolveExit, rejectExit) => {
    playwright.once('error', rejectExit); playwright.once('exit', (value) => resolveExit(value ?? 1));
  });
  children.delete(playwright);
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const child of children) terminate(child, 'SIGTERM');
  process.exitCode = 1;
});
try { await run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await Promise.all([...children].map(stop));
  for (const log of logs) log.end();
  rmSync(scratch, { recursive: true, force: true });
}
