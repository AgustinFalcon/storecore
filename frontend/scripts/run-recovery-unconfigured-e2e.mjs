import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import net from 'node:net';

// Deliberately production classpath only. No recovery secrets enter this runner.
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jar = resolve(frontend, '../backend/target/storecore-backend-0.1.0-SNAPSHOT.jar');
const results = join(frontend, 'recovery-real-results');
const scratch = mkdtempSync(join(tmpdir(), 'storecore-recovery-ui-'));
const container = `storecore-recovery-ui-${process.pid}`;
const children = new Set(), logs = [];
let created = false;
mkdirSync(results, { recursive: true });
function execute(command, args) {
  const result = spawnSync(command, args, { cwd: frontend, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
function start(command, args, name, env = process.env) {
  const log = createWriteStream(join(results, `${name}.log`)); logs.push(log);
  const child = spawn(command, args, { cwd: frontend, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child); child.stdout.pipe(log); child.stderr.pipe(log);
  return child;
}
async function ready(child, url, secure = false) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.pid === undefined) throw new Error('Local service exited; inspect recovery-real-results');
    try {
      const okay = secure ? await new Promise(resolveResponse => {
        const request = https.get(url, { rejectUnauthorized: false, timeout: 2000 }, response => { response.resume(); resolveResponse(response.statusCode === 200); });
        request.on('error', () => resolveResponse(false)); request.on('timeout', () => request.destroy());
      }) : (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
      if (okay) return;
    } catch { /* bounded local readiness */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  throw new Error('Local readiness timed out');
}
async function run() {
  if (!existsSync(jar)) throw new Error('Build the production backend jar first');
  for (const port of [8083, 4303]) {
    const server = net.createServer();
    await new Promise((resolveBind, rejectBind) => { server.once('error', rejectBind); server.listen(port, port === 4303 ? 'localhost' : '127.0.0.1', resolveBind); });
    await new Promise(resolveClose => server.close(resolveClose));
  }
  execute('docker', ['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_DB=storecore_recovery_ui', '-e', 'POSTGRES_USER=storecore', '-e', 'POSTGRES_PASSWORD=storecore', '-p', '127.0.0.1::5432', 'postgres:16']); created = true;
  const deadline = Date.now() + 60_000;
  while (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'storecore'], { windowsHide: true, stdio: 'ignore' }).status !== 0) {
    if (Date.now() >= deadline) throw new Error('PostgreSQL readiness timed out');
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  const port = JSON.parse(execute('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]))['5432/tcp'][0].HostPort;
  const cert = join(scratch, 'localhost.crt'), key = join(scratch, 'localhost.key');
  const openssl = process.env.STORECORE_UA_OPENSSL ?? (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
  execute(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost']);
  const backend = start(process.env.STORECORE_UA_JAVA ?? 'java', ['-Duser.timezone=UTC', '-jar', jar, '--server.address=127.0.0.1', '--server.port=8083', '--storecore.installation-guard.enabled=false'], 'backend', {
    ...process.env, STORECORE_DB_URL: `jdbc:postgresql://127.0.0.1:${port}/storecore_recovery_ui`, STORECORE_DB_USERNAME: 'storecore', STORECORE_DB_PASSWORD: 'storecore', STORECORE_INSTALLATION_ORIGIN: 'https://localhost:4303',
  });
  await ready(backend, 'http://127.0.0.1:8083/actuator/health');
  const registered = await fetch('http://127.0.0.1:8083/api/v1/customer/auth/register', { method: 'POST', headers: { Origin: 'https://localhost:4303', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'known@example.test', password: 'recovery-ui-fixture-password', firstName: 'Recovery', lastName: 'Fixture' }) });
  if (registered.status !== 201) throw new Error(`Disposable fixture registration failed (${registered.status})`);
  const angular = start(process.execPath, [join(frontend, 'node_modules/@angular/cli/bin/ng.js'), 'serve', '--host', 'localhost', '--port', '4303', '--ssl', '--ssl-cert', cert, '--ssl-key', key, '--proxy-config', 'proxy.recovery-real.conf.json'], 'angular');
  await ready(angular, 'https://localhost:4303/recover', true);
  const browser = start(process.execPath, [join(frontend, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.recovery-real.config.ts'], 'browser');
  const code = await new Promise(resolveExit => browser.once('exit', resolveExit));
  if (code !== 0) throw new Error('Real browser failed; inspect recovery-real-results/browser.log');
  const tokens = execute('docker', ['exec', container, 'psql', '-U', 'storecore', '-d', 'storecore_recovery_ui', '-Atc', 'SELECT count(*) FROM identity_recovery_tokens']);
  if (tokens !== '0') throw new Error('Unconfigured delivery unexpectedly persisted recovery tokens');
  console.log('Real PostgreSQL/Spring/HTTPS browser: unavailable for all contexts and emails; zero recovery tokens.');
}
try { await run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  for (const child of children) if (child.pid !== undefined && child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
    else child.kill('SIGTERM');
  }
  if (created) spawnSync('docker', ['rm', '-f', container], { windowsHide: true, stdio: 'ignore', timeout: 30_000 });
  for (const log of logs) log.end();
  // Only this runner's freshly-created scratch directory is removed.
  if (dirname(resolve(scratch)) !== resolve(tmpdir()) || !basename(scratch).startsWith('storecore-recovery-ui-')) throw new Error('Unsafe scratch cleanup path');
  rmSync(scratch, { recursive: true, force: true });
}
