import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import net from 'node:net';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(frontend, '../backend');
const results = join(frontend, 'recovery-real-results');
const scratch = mkdtempSync(join(tmpdir(), 'storecore-recovery-success-'));
const container = `storecore-recovery-success-${process.pid}`;
const children = new Set(), logs = [];
let created = false, jvmProcess;
mkdirSync(results, { recursive: true });
rmSync(join(results, 'success-summary.json'), { force: true });
function execute(command, args) {
  const result = spawnSync(command, args, { cwd: frontend, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  if (result.error || result.status !== 0) throw new Error('Recovery setup command failed');
  return result.stdout.trim();
}
function start(command, args, name, env = process.env, stdin = 'ignore') {
  const log = createWriteStream(join(results, name + '.log')); logs.push(log);
  const child = spawn(command, args, { cwd: frontend, env, windowsHide: true, detached: process.platform !== 'win32', stdio: [stdin, 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  children.add(child); child.on('exit', () => children.delete(child));
  child.on('error', () => log.write('RECOVERY_PROCESS_FAILED\n'));
  return child;
}
function terminate(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
  else if (child === jvmProcess) child.kill('SIGTERM'); // Let the JVM hook close its private child tree first.
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
}
async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolveExit => child.once('exit', resolveExit));
  terminate(child);
  const force = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }, 10_000);
  await done; clearTimeout(force);
}
async function ready(child, url, secure = false) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) throw new Error('Recovery server failed');
    try {
      const good = secure ? await new Promise(resolveReady => {
        const request = https.get(url, { rejectUnauthorized: false, timeout: 2000 }, response => { response.resume(); resolveReady(response.statusCode === 200); });
        request.on('error', () => resolveReady(false)); request.on('timeout', () => request.destroy());
      }) : (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
      if (good) return;
    } catch { /* Bounded polling of this runner's known children. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 300));
  }
  throw new Error('Recovery readiness timed out');
}
async function run() {
  const cpPath = join(backend, 'target/recovery-e2e-classpath.txt');
  const script = join(results, 'build/browser.mjs');
  if (!existsSync(cpPath) || !existsSync(script)) throw new Error('Build recovery test classpath and browser first');
  for (const [port, host] of [[8080, '127.0.0.1'], [4301, 'localhost']]) {
    const probe = net.createServer();
    await new Promise((yes, no) => { probe.once('error', no); probe.listen(port, host, yes); });
    await new Promise(yes => probe.close(yes));
  }
  execute('docker', ['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_DB=storecore_ua_e2e', '-e', 'POSTGRES_USER=storecore', '-e', 'POSTGRES_PASSWORD=storecore', '-p', '127.0.0.1::5432', 'postgres:16-alpine']);
  created = true;
  const published = execute('docker', ['port', container, '5432']).match(/^127\.0\.0\.1:(\d+)$/);
  if (!published) throw new Error('Unexpected recovery database binding');
  const dbPort = published[1];
  let postgresReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const check = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'storecore', '-d', 'storecore_ua_e2e'], { stdio: 'ignore', timeout: 3000, windowsHide: true });
    if (check.status === 0) { postgresReady = true; break; }
    await new Promise(yes => setTimeout(yes, 300));
  }
  if (!postgresReady) throw new Error('Recovery database did not start');
  const certificate = join(scratch, 'localhost.crt'), key = join(scratch, 'localhost.key');
  execute(process.env.STORECORE_UA_OPENSSL ?? 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost']);
  const classpath = [join(backend, 'target/test-classes'), join(backend, 'target/classes'), readFileSync(cpPath, 'utf8').trim()].join(delimiter);
  const env = { ...process.env, STORECORE_DB_URL: `jdbc:postgresql://127.0.0.1:${dbPort}/storecore_ua_e2e`, STORECORE_DB_USERNAME: 'storecore', STORECORE_DB_PASSWORD: 'storecore', STORECORE_INSTALLATION_ORIGIN: 'https://localhost:4301' };
  delete env.DEBUG; delete env.PWDEBUG;
  const jvm = start(process.env.STORECORE_UA_JAVA ?? 'java', ['-cp', classpath, 'com.storecore.identity.RecoveryBrowserHarness', process.execPath, script], 'success-backend', env, 'pipe');
  jvmProcess = jvm;
  await ready(jvm, 'http://127.0.0.1:8080/actuator/health');
  const angular = start(process.execPath, [join(frontend, 'node_modules/@angular/cli/bin/ng.js'), 'serve', '--configuration', 'production', '--host', 'localhost', '--port', '4301', '--ssl', '--ssl-cert', certificate, '--ssl-key', key, '--proxy-config', 'proxy.ua-real.conf.json'], 'success-angular');
  await ready(angular, 'https://localhost:4301/login', true);
  const completed = new Promise((yes, no) => { jvm.once('error', () => no(new Error('Recovery harness launch failed'))); jvm.once('exit', code => code === 0 ? yes() : no(new Error('Recovery browser assertions failed'))); });
  jvm.stdin.end('RUN\n');
  const watchdog = setTimeout(() => terminate(jvm), 210_000);
  try { await completed; } finally { clearTimeout(watchdog); }
  writeFileSync(join(results, 'success-summary.json'), JSON.stringify({ cases: 2, passed: 2, capture: 'private-child-stdin', trace: false, provider: 'test-only' }) + '\n');
  console.log('Recovery real success: 2/2 cases passed');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) terminate(child); process.exitCode = 1; });
try { await run(); } catch { console.error('Recovery real success gate failed; inspect sanitized supervisor logs'); process.exitCode = 1; }
finally {
  await Promise.all([...children].map(stop));
  for (const log of logs) await new Promise(done => log.end(done));
  if (created) spawnSync('docker', ['stop', container], { stdio: 'ignore', timeout: 20_000, windowsHide: true });
  if (dirname(scratch) !== resolve(tmpdir()) || !basename(scratch).startsWith('storecore-recovery-success-')) throw new Error('Invalid recovery scratch path');
  rmSync(scratch, { recursive: true, force: true });
}
