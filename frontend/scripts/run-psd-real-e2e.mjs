import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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
// Never inherit Spring/JVM configuration, proxy settings, credentials or preload hooks.
const inherited = process.env;
const childKeys = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'WINDIR',
  'JAVA_HOME', 'CI', 'PLAYWRIGHT_BROWSERS_PATH', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD',
  'STORECORE_UA_JAVA', 'STORECORE_UA_PSQL', 'STORECORE_UA_OPENSSL', 'STORECORE_PSD_EGRESS_PROOF',
  'GITHUB_SHA'];
process.env = databaseEnvironment(Object.fromEntries(childKeys.filter(key => inherited[key] !== undefined)
  .map(key => [key, inherited[key]])));
process.env.STORECORE_IDENTITY_DELIVERY_MODE = 'UNCONFIGURED';
process.env.STORECORE_IDENTITY_DELIVERY_WORKER_ENABLED = 'false';
process.env.PLAYWRIGHT_HTML_OPEN = 'never';
const scratch = mkdtempSync(join(tmpdir(), 'storecore-psd-e2e-'));
process.env.STORECORE_PSD_RAW_REPORT = join(scratch, 'browser-report.json');
process.env.STORECORE_PSD_AUTH_DIR = join(scratch, 'route-auth');
mkdirSync(results, { recursive: true });

const OUTCOME_TOKEN = Symbol('BrowserOutcome');
class BrowserOutcome {
  constructor(token, wire, accepted) {
    if (token !== OUTCOME_TOKEN) throw new TypeError('BrowserOutcome is closed');
    Object.assign(this, { wire, accepted }); Object.freeze(this);
  }
  static Passed = new BrowserOutcome(OUTCOME_TOKEN, 'passed', true);
  static Failed = new BrowserOutcome(OUTCOME_TOKEN, 'failed', false);
  static TimedOut = new BrowserOutcome(OUTCOME_TOKEN, 'timedOut', false);
  static Skipped = new BrowserOutcome(OUTCOME_TOKEN, 'skipped', false);
  static Interrupted = new BrowserOutcome(OUTCOME_TOKEN, 'interrupted', false);
  static Unknown = new BrowserOutcome(OUTCOME_TOKEN, 'unknown', false);
  static fromWire(raw) {
    return [this.Passed, this.Failed, this.TimedOut, this.Skipped, this.Interrupted]
      .find(value => value.wire === raw) ?? this.Unknown;
  }
}

const PUBLICATION_TOKEN = Symbol('PublicationValue');
class PublicationValue {
  constructor(token, wire, accepted) {
    if (token !== PUBLICATION_TOKEN) throw new TypeError('PublicationValue is closed');
    Object.assign(this, { wire, accepted }); Object.freeze(this);
  }
  static fromWire(raw, values) { return values.find(value => value.wire === raw) ?? this.Unknown; }
  static Unknown = new PublicationValue(PUBLICATION_TOKEN, 'UNKNOWN', false);
}
class PublishedGateResult extends PublicationValue {
  static Accepted = new PublishedGateResult(PUBLICATION_TOKEN, 'ACCEPTED', true);
  static Rejected = new PublishedGateResult(PUBLICATION_TOKEN, 'REJECTED', false);
  static values = [this.Accepted, this.Rejected];
  static fromWire(raw) { return super.fromWire(raw, this.values); }
}
class PublishedActor extends PublicationValue {
  static Anonymous = new PublishedActor(PUBLICATION_TOKEN, 'ANONYMOUS', true);
  static Customer = new PublishedActor(PUBLICATION_TOKEN, 'CUSTOMER', true);
  static Admin = new PublishedActor(PUBLICATION_TOKEN, 'ADMIN', true);
  static ForeignCustomer = new PublishedActor(PUBLICATION_TOKEN, 'FOREIGN_CUSTOMER', true);
  static Operator = new PublishedActor(PUBLICATION_TOKEN, 'OPERATOR', true);
  static values = [this.Anonymous, this.Customer, this.Admin, this.ForeignCustomer, this.Operator];
  static fromWire(raw) { return super.fromWire(raw, this.values); }
}
class PublishedActionKind extends PublicationValue {
  static Read = new PublishedActionKind(PUBLICATION_TOKEN, 'READ', true);
  static Mutation = new PublishedActionKind(PUBLICATION_TOKEN, 'MUTATION', true);
  static Rejection = new PublishedActionKind(PUBLICATION_TOKEN, 'REJECTION', true);
  static values = [this.Read, this.Mutation, this.Rejection];
  static fromWire(raw) { return super.fromWire(raw, this.values); }
}
class PublishedReadTerminal extends PublicationValue {
  static Pending = new PublishedReadTerminal(PUBLICATION_TOKEN, 'pending', true);
  static Finished = new PublishedReadTerminal(PUBLICATION_TOKEN, 'finished', true);
  static Failed = new PublishedReadTerminal(PUBLICATION_TOKEN, 'failed', true);
  static values = [this.Pending, this.Finished, this.Failed];
  static fromWire(raw) { return super.fromWire(raw, this.values); }
}
class PublishedReadFailure extends PublicationValue {
  static Aborted = new PublishedReadFailure(PUBLICATION_TOKEN, 'aborted', true);
  static Connection = new PublishedReadFailure(PUBLICATION_TOKEN, 'connection', true);
  static UnknownFailure = new PublishedReadFailure(PUBLICATION_TOKEN, 'unknown', true);
  static values = [this.Aborted, this.Connection, this.UnknownFailure];
  static fromWire(raw) { return super.fromWire(raw, this.values); }
}
class PublishedAxeImpact extends PublicationValue {
  static Minor = new PublishedAxeImpact(PUBLICATION_TOKEN, 'minor', true);
  static Moderate = new PublishedAxeImpact(PUBLICATION_TOKEN, 'moderate', true);
  static Serious = new PublishedAxeImpact(PUBLICATION_TOKEN, 'serious', true);
  static Critical = new PublishedAxeImpact(PUBLICATION_TOKEN, 'critical', true);
  static UnknownImpact = new PublishedAxeImpact(PUBLICATION_TOKEN, 'unknown', true);
  static values = [this.Minor, this.Moderate, this.Serious, this.Critical, this.UnknownImpact];
  static fromWire(raw) { return super.fromWire(raw, this.values); }
}
const publishedActionIds = new Set(['registration', 'catalog-discovery', 'profile', 'addresses-ownership', 'favorites',
  'cart-checkout-order-ownership', 'unpaid-order-rejection', 'catalog-inventory', 'offers', 'promos',
  'branding-conflict', 'content', 'profile-import', 'customer-revocation', 'operator-permissions-csrf',
  'external-unavailable', 'local-capability-command']);
const publishedSurfaces = new Set([
  ...Array.from({ length: 27 }, (_, index) => `SC-SURF-${String(index + 1).padStart(2, '0')}`),
  'RD-VERIFY-EMAIL', 'RD-USER-ACCOUNT',
]);
const publishedFailureFiles = new Set([
  'route-matrix.spec.ts', 'route-matrix-support.ts', 'surfaces.spec.ts',
  'z-action-matrix.spec.ts', 'action-matrix-support.ts', 'support.ts',
]);

function publishEvidence(reportPath, target = results) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const rows = [], routes = [], actions = [], diagnostics = [], routeKeys = new Set(), actionKeys = new Set();
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  const pathOnly = value => new URL(value, httpsOrigin).pathname;
  const pathShape = value => pathOnly(value).split('/').map(segment => {
    if (/^\d+$/.test(segment)) return ':id';
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment)) return ':uuid';
    if (/^000-PRM-[0-9a-f-]+$/i.test(segment)) return ':sku';
    return segment;
  }).join('/');
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = test.results?.at(-1);
        const outcome = BrowserOutcome.fromWire(last?.status);
        assert.notEqual(outcome, BrowserOutcome.Unknown, 'Unknown browser result');
        const rawFailureLocation = (last?.errors ?? []).map(error => error.location)
          .find(location => location && Number.isInteger(location.line));
        const failureFile = basename(rawFailureLocation?.file ?? '');
        const failureAt = !outcome.accepted && publishedFailureFiles.has(failureFile)
          ? `${failureFile}:${rawFailureLocation.line}` : 'redacted:0';
        // Use a generated identifier; failure messages, source snippets and test stdout never leave scratch.
        rows.push({ name: `browser-case-${rows.length + 1}`, file: basename(spec.file ?? ''),
          line: Number.isInteger(spec.line) ? spec.line : 0, outcome, failureAt });
        const actionAnnotation = (test.annotations ?? []).find(annotation => annotation.type === 'action');
        const evidenceAnnotation = (test.annotations ?? []).find(annotation => annotation.type === 'evidence');
        if (actionAnnotation) {
          assert.equal(evidenceAnnotation?.description, 'REAL_BACKEND');
          const action = JSON.parse(actionAnnotation.description ?? '{}');
          assert.equal(publishedActionIds.has(action.id), true, 'Unknown action evidence');
          assert.equal(actionKeys.has(action.id), false, 'Duplicate action evidence');
          assert.equal(PublishedActor.fromWire(action.actor).accepted, true);
          assert.equal(PublishedActionKind.fromWire(action.kind).accepted, true);
          assert.ok(Array.isArray(action.routes) && action.routes.length > 0 &&
            action.routes.every(route => typeof route === 'string' && route.startsWith('/')));
          actionKeys.add(action.id);
          const transport = (test.annotations ?? []).filter(annotation => annotation.type === 'action-http').map(annotation => {
            const row = JSON.parse(annotation.description ?? '{}');
            assert.match(row.method, /^(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)$/);
            assert.ok(row.status === null || Number.isInteger(row.status) && row.status >= 100 && row.status <= 599);
            const terminal = PublishedReadTerminal.fromWire(row.terminal);
            assert.equal(terminal.accepted, true, 'Unknown action transport terminal');
            return { method: row.method, path: pathShape(row.path), status: row.status, terminal: terminal.wire };
          });
          actions.push({ id: action.id, routes: action.routes, actor: action.actor, kind: action.kind,
            evidence: 'REAL_BACKEND', accepted: outcome.accepted, transport });
        }
        for (const attachment of last.attachments ?? []) {
          if (attachment.name === 'real-route-diagnostic' && attachment.body) {
            const raw = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
            assert.ok(Number.isInteger(raw.width) && [390, 768, 1440].includes(raw.width));
            assert.ok(typeof raw.pattern === 'string' && typeof raw.finalPath === 'string' && Array.isArray(raw.requests));
            const reflow = raw.reflow === null || raw.reflow === undefined ? null : (() => {
              assert.ok(Number.isInteger(raw.reflow.viewportWidth) && Number.isInteger(raw.reflow.documentWidth));
              assert.equal(typeof raw.reflow.overflow, 'boolean');
              assert.ok(Array.isArray(raw.reflow.nodes));
              return { viewportWidth: raw.reflow.viewportWidth, documentWidth: raw.reflow.documentWidth,
                overflow: raw.reflow.overflow, nodes: raw.reflow.nodes.map(node => {
                  assert.match(node.tag, /^[a-z][a-z0-9-]*$/);
                  assert.match(node.path, /^(?:[a-z][a-z0-9-]*:\d+)(?:\/[a-z][a-z0-9-]*:\d+)*$/);
                  for (const key of ['left', 'right', 'width']) assert.ok(Number.isInteger(node[key]));
                  return { tag: node.tag, path: node.path, left: node.left, right: node.right, width: node.width };
                }) };
            })();
            const axe = (raw.axe ?? []).map(row => {
              assert.match(row.id, /^[a-z0-9-]+$/);
              const impact = PublishedAxeImpact.fromWire(row.impact);
              assert.equal(impact.accepted, true, 'Unknown accessibility impact');
              assert.ok(Number.isInteger(row.nodeCount) && row.nodeCount >= 0);
              return { id: row.id, impact: impact.wire, nodeCount: row.nodeCount };
            });
            diagnostics.push({ pattern: pathOnly(raw.pattern), width: raw.width, finalPath: pathOnly(raw.finalPath),
              reflow, axe,
              accepted: outcome.accepted, requests: raw.requests.map(request => {
                assert.match(request.method, /^(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)$/);
                assert.ok(request.status === null || Number.isInteger(request.status) && request.status >= 100 && request.status <= 599);
                const terminal = PublishedReadTerminal.fromWire(request.terminal);
                assert.equal(terminal.accepted, true, 'Unknown request terminal');
                const failure = request.failure === null || request.failure === undefined ? null : PublishedReadFailure.fromWire(request.failure);
                if (failure) assert.equal(failure.accepted, true, 'Unknown request failure');
                return { method: request.method, path: pathOnly(request.path), status: request.status,
                  terminal: terminal.wire, failure: failure?.wire ?? null };
              }) });
            continue;
          }
          if (attachment.name !== 'real-route-acceptance' || !attachment.body) continue;
          const raw = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
          assert.equal(raw.evidence, 'REAL_BACKEND');
          assert.ok(Number.isInteger(raw.width) && [390, 768, 1440].includes(raw.width));
          assert.equal(raw.axeBlocking, 0);
          assert.equal(PublishedGateResult.fromWire(raw.result), PublishedGateResult.Accepted);
          assert.equal(PublishedActor.fromWire(raw.actor).accepted, true);
          assert.equal(publishedSurfaces.has(raw.surface), true, 'Unknown published surface');
          const routeKey = `${pathOnly(raw.pattern)}|${raw.width}`;
          assert.equal(routeKeys.has(routeKey), false, 'Duplicate route/viewport evidence');
          routeKeys.add(routeKey);
          // Publish only route identity and counters; do not copy arbitrary nested request data.
          routes.push({ pattern: pathOnly(raw.pattern), width: raw.width, finalPath: pathOnly(raw.finalUrl),
            actor: raw.actor, surface: raw.surface, evidence: 'REAL_BACKEND',
            accepted: outcome.accepted, axeBlocking: raw.axeBlocking,
            responses: (raw.responses ?? []).map(response => {
              assert.match(response.method, /^(GET|HEAD|OPTIONS|POST)$/);
              assert.ok(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599);
              return { method: response.method, path: pathOnly(response.path), status: response.status };
            }) });
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  assert.ok(rows.length > 0, 'No browser evidence');
  const failures = rows.filter(row => !row.outcome.accepted).length;
  assert.equal(routeKeys.size, routes.length, 'Route evidence identities must be unique');
  mkdirSync(join(target, 'report'), { recursive: true });
  writeFileSync(join(target, 'junit.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${rows.length}" failures="${failures}"><testsuite name="productive-routes-real" tests="${rows.length}" failures="${failures}">${rows.map(row =>
    `<testcase name="${row.name}" classname="${escape(row.file)}:${row.line}">${row.outcome.accepted ? '' : `<failure message="${escape(row.outcome.wire)}">Assertion location: ${escape(row.failureAt)}. Values, messages and source are redacted.</failure>`}</testcase>`).join('')}</testsuite></testsuites>\n`);
  writeFileSync(join(target, 'report/index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Productive routes real</title><main><h1>Productive routes real</h1><p>${rows.length} browser cases; ${failures} failed or incomplete. Error bodies, source and credentials are excluded.</p><ol>${rows.map(row =>
    `<li>${row.name} (${escape(row.file)}:${row.line}): ${escape(row.outcome.wire)}</li>`).join('')}</ol></main></html>\n`);
  writeFileSync(join(target, 'route-census.json'), `${JSON.stringify(routes, null, 2)}\n`);
  writeFileSync(join(target, 'action-census.json'), `${JSON.stringify(actions, null, 2)}\n`);
  writeFileSync(join(target, 'route-diagnostics.json'), `${JSON.stringify(diagnostics, null, 2)}\n`);
  return { cases: rows.length, failures, routeAcceptances: routes.length, actionAcceptances: actions.length };
}

function checkSecurityContracts() {
  for (const forbidden of ['NODE_OPTIONS', 'JAVA_TOOL_OPTIONS', 'SPRING_APPLICATION_JSON', 'HTTPS_PROXY', 'STORECORE_IDENTITY_DELIVERY_SMTP_PASSWORD']) {
    assert.equal(process.env[forbidden], undefined);
  }
  assert.equal(process.env.STORECORE_IDENTITY_DELIVERY_MODE, 'UNCONFIGURED');
  assert.equal(process.env.STORECORE_IDENTITY_DELIVERY_WORKER_ENABLED, 'false');
  const path = join(scratch, 'report-fixture.json');
  const secret = 'SHOULD_NEVER_APPEAR_IN_PUBLIC_EVIDENCE';
  writeFileSync(path, JSON.stringify({ suites: [{ specs: [{ title: secret, tests: [{ annotations: [
    { type: 'evidence', description: 'REAL_BACKEND' },
    { type: 'action', description: JSON.stringify({ id: 'profile', routes: ['/customer/profile'], actor: 'CUSTOMER', kind: 'MUTATION' }) },
    { type: 'action-http', description: JSON.stringify({ method: 'GET', path: `/api/v1/customer/me?secret=${secret}`,
      status: 200, terminal: PublishedReadTerminal.Finished.wire, body: secret }) },
  ], results: [{
    status: BrowserOutcome.Failed.wire, errors: [{ message: secret,
      location: { file: `/tmp/${secret}/route-matrix.spec.ts`, line: 70, column: 1 } }],
    stdout: [{ text: secret }], attachments: [{ name: 'real-route-diagnostic', body: Buffer.from(JSON.stringify({
      pattern: `/customer/profile?secret=${secret}`, width: 390, finalPath: `/customer/profile?secret=${secret}#${secret}`,
      requests: [{ method: 'GET', path: `/api/v1/customer/me?secret=${secret}`, status: 200,
        terminal: PublishedReadTerminal.Finished.wire, failure: null, body: secret, identity: secret }],
      reflow: { viewportWidth: 390, documentWidth: 390, overflow: false, nodes: [], secret },
      axe: [{ id: 'color-contrast', impact: PublishedAxeImpact.Serious.wire, nodeCount: 1, secret }],
    })).toString('base64') }],
  }] }] }] }] }));
  const target = join(scratch, 'safe-report');
  assert.deepEqual(publishEvidence(path, target), { cases: 1, failures: 1, routeAcceptances: 0, actionAcceptances: 1 });
  for (const file of ['junit.xml', 'report/index.html', 'route-census.json', 'action-census.json', 'route-diagnostics.json']) {
    assert.equal(readFileSync(join(target, file), 'utf8').includes(secret), false);
  }
  assert.equal(readFileSync(join(target, 'junit.xml'), 'utf8').includes('route-matrix.spec.ts:70'), true);
  assert.deepEqual(JSON.parse(readFileSync(join(target, 'route-diagnostics.json'), 'utf8'))[0].requests,
    [{ method: 'GET', path: '/api/v1/customer/me', status: 200, terminal: PublishedReadTerminal.Finished.wire, failure: null }]);
  const invalidAttachment = (overrides = {}) => ({ suites: [{ specs: [{ file: 'route.spec.ts', line: 1, tests: [{ results: [{
    status: BrowserOutcome.Passed.wire, attachments: [{ name: 'real-route-acceptance', body: Buffer.from(JSON.stringify({
      pattern: 'catalog', width: 390, actor: PublishedActor.Customer.wire, evidence: 'REAL_BACKEND',
      surface: 'SC-SURF-04', finalUrl: '/catalog', result: PublishedGateResult.Accepted.wire,
      responses: [], axeBlocking: 0, ...overrides,
    })).toString('base64') }],
  }] }] }] }] });
  for (const overrides of [{ result: 'FUTURE' }, { result: PublishedGateResult.Rejected.wire },
    { actor: 'FUTURE' }, { actor: 'UNKNOWN' }, { surface: 'FUTURE-SURFACE' }]) {
    const invalid = join(scratch, `invalid-${Object.keys(overrides)[0]}-${String(Object.values(overrides)[0])}.json`);
    writeFileSync(invalid, JSON.stringify(invalidAttachment(overrides)));
    assert.throws(() => publishEvidence(invalid, join(scratch, 'invalid-output')));
  }
  assert.equal(BrowserOutcome.fromWire('future-outcome'), BrowserOutcome.Unknown);
  console.log('PSD environment, closed outcomes and evidence redaction checks passed');
}

function verifyEgressBoundary() {
  if (process.platform !== 'linux' || !process.getuid || process.getuid() === 0) {
    throw new Error('PSD requires a non-root Linux runtime UID with loopback-only IPv4/IPv6 owner firewall rules');
  }
  const path = process.env.STORECORE_PSD_EGRESS_PROOF;
  if (!path) throw new Error('Missing root-owned PSD firewall attestation; see productive-surface-real-e2e.md');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error('Unsafe PSD firewall attestation');
  const proof = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(proof.uid, process.getuid(), 'Firewall must cover this exact runtime UID');
  assert.equal(proof.ipv4, 'reject-non-loopback');
  assert.equal(proof.ipv6, 'reject-non-loopback');
}

async function deniedNodeConnection(host, port) {
  await new Promise((accept, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); reject(new Error('Node egress self-test escaped')); });
    socket.once('error', () => { socket.destroy(); accept(); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Node egress was not rejected promptly')); });
  });
}

async function egressSelfTests() {
  verifyEgressBoundary();
  const controlSockets = new Set();
  const local = net.createServer(socket => {
    controlSockets.add(socket);
    socket.once('close', () => controlSockets.delete(socket));
    socket.on('error', () => undefined);
    socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK');
  });
  await new Promise((accept, reject) => { local.once('error', reject); local.listen(0, '127.0.0.1', accept); });
  const port = local.address().port;
  try {
  assert.equal((await fetch(`http://127.0.0.1:${port}`)).status, 200, 'Node loopback positive control');
  // The CI firewall rejects TCP before any HTTP/WebSocket handshake, for every child UID.
  for (const host of ['198.51.100.1', '2001:db8::1', 'psd-egress.invalid']) await deniedNodeConnection(host, 80);
  const javaSource = join(scratch, 'PsdEgressProbe.java');
  writeFileSync(javaSource, `import java.net.*; import java.io.*;
class PsdEgressProbe {
  public static void main(String[] args) throws Exception {
    try (Socket local = new Socket()) { local.connect(new InetSocketAddress("127.0.0.1", Integer.parseInt(args[0])), 1500); }
    for (String host : new String[]{"198.51.100.1", "2001:db8::1", "psd-egress.invalid"}) {
      try (Socket socket = new Socket()) {
        try { socket.connect(new InetSocketAddress(host, 80), 1500); }
        catch (SocketTimeoutException ex) { throw new IllegalStateException("JVM egress not rejected promptly"); }
        catch (IOException blocked) { continue; }
        throw new IllegalStateException("JVM egress escaped");
      }
    }
  }
}`);
  const java = spawnSync(process.env.STORECORE_UA_JAVA ?? 'java', [javaSource, String(port)],
    { env: process.env, encoding: 'utf8', timeout: 30_000 });
  if (java.error || java.status !== 0) throw new Error('JVM egress self-test failed');
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
    const probes = await page.evaluate(async () => {
      const denied = async url => {
        try { await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(3000) }); return false; }
        catch { return true; }
      };
      const socketDenied = await new Promise(resolveBlocked => {
        const socket = new WebSocket('ws://198.51.100.1/psd-egress');
        const timer = setTimeout(() => { socket.close(); resolveBlocked(false); }, 3000);
        socket.onerror = () => { clearTimeout(timer); socket.close(); resolveBlocked(true); };
        socket.onopen = () => { clearTimeout(timer); socket.close(); resolveBlocked(false); };
      });
      return { ip: await denied('http://198.51.100.1/psd-egress'),
        ipv6: await denied('http://[2001:db8::1]/psd-egress'),
        hostname: await denied('http://psd-egress.invalid/psd-egress'), websocket: socketDenied };
    });
    assert.deepEqual(probes, { ip: true, ipv6: true, hostname: true, websocket: true });
  } finally { await browser.close(); }
  writeFileSync(join(results, 'egress.json'), `${JSON.stringify({ uid: process.getuid(),
    node: true, jvm: true, chromium: true, hostname: true, ip: true, ipv6: true, websocket: true })}\n`);
  } finally {
    for (const socket of controlSockets) socket.destroy();
    await new Promise((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error('Egress positive-control server did not close')), 5_000);
      local.close(error => {
        clearTimeout(timeout);
        if (error) reject(error); else accept();
      });
    });
  }
}

function start(command, args, name, env = process.env) {
  // Raw framework/browser output can contain credentials in assertion diagnostics.
  // Keep it ephemeral; publish only lifecycle summaries, never raw process output.
  const log = createWriteStream(join(scratch, `${name}.log`)); logs.push(log);
  writeFileSync(join(results, `${name}.log`), `${name}: started\n`);
  const child = spawn(command, args, { cwd: frontend, env, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.on('error', error => log.write(`${error.message}\n`));
  children.add(child); child.on('exit', (code, signal) => {
    children.delete(child);
    writeFileSync(join(results, `${name}.log`), `${name}: exit ${code ?? signal}\n`);
  });
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
    '--storecore.integrations.mp-orders.adapter=unconfigured',
    '--storecore.identity.delivery.mode=UNCONFIGURED',
    '--storecore.identity.delivery.worker-enabled=false',
    '--storecore.identity.trusted-proxies='], name, { ...process.env,
    STORECORE_DB_URL: `jdbc:postgresql://${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`,
    STORECORE_DB_USERNAME: process.env.PGUSER, STORECORE_DB_PASSWORD: process.env.PGPASSWORD,
    STORECORE_INSTALLATION_ORIGIN: origin });
}
async function run() {
  await egressSelfTests();
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
    INSERT INTO users(email,password_hash,first_name,last_name)
      SELECT 'psd-route-admin@storecore.invalid',password_hash,'PSD','Routes' FROM customers WHERE email='psd-hash@storecore.invalid';
    INSERT INTO users(email,password_hash,first_name,last_name)
      SELECT 'psd-action-admin@storecore.invalid',password_hash,'PSD','Action admin' FROM customers WHERE email='psd-hash@storecore.invalid';
    INSERT INTO users(email,password_hash,first_name,last_name)
      SELECT 'psd-action-operator@storecore.invalid',password_hash,'PSD','Action operator' FROM customers WHERE email='psd-hash@storecore.invalid';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='ADMIN' WHERE u.email='${adminEmail}';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='OPERATOR' WHERE u.email='psd-operator@storecore.invalid';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='ADMIN' WHERE u.email='psd-browser-admin@storecore.invalid';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='ADMIN' WHERE u.email='psd-route-admin@storecore.invalid';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='ADMIN' WHERE u.email='psd-action-admin@storecore.invalid';
    INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM users u JOIN roles r ON r.code='OPERATOR' WHERE u.email='psd-action-operator@storecore.invalid';
    COMMIT;`);
  await stop(provision);
  const loading = spring(httpOrigin, true, 'backend-loader');
  await ready(loading, 'http://127.0.0.1:8080/actuator/health');
  const config = new ShowcaseConfig({ baseUrl: 'http://127.0.0.1:8080', origin: httpOrigin,
    adminEmail, adminPassword: fixturePassword, includePendingOrder: true, requireRealRouteReceipt: true,
    manualFulfillmentPolicy: {
      pickup: { enabled: true, label: 'Retiro local PSD', cost: '0.00', minDays: 0, maxDays: 1,
        destination: 'Local descartable PSD', instructions: 'Presentar confirmación del pedido' },
      localDelivery: { enabled: true, label: 'Entrega local PSD', cost: '0.00', minDays: 1, maxDays: 2 },
    } });
  const first = new ShowcaseLoader(config);
  const firstResult = await first.run();
  assert.equal(firstResult.pendingOrderCreated, true);
  writeFileSync(join(results, 'fixture-receipt.json'), `${JSON.stringify(firstResult.receipt, null, 2)}\n`);
  const unrelated = await first.context.admin.request('/api/v1/user/offers', {
    method: 'POST', csrf: true, expected: [201], envelopeCode: 200,
    body: { name: 'PSD_OPERATOR_OWNED', priority: 7, startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(), discountKind: ShowcaseDiscountKind.Percent.wire,
      discountValue: 3, minMarginPercent: 0, skus: ['SHOW-SET-MANUAL'] } });
  const seededPromo = await first.context.admin.request('/api/v1/user/promos', {
    method: 'POST', csrf: true, expected: [200], envelopeCode: 200,
    body: { listingSku: firstResult.receipt.products[0].sku, currency: 'ARS', priceScope: 'DEFAULT',
      desiredPrice: 180000, effectivePromoPrice: null, validFrom: new Date(Date.now() - 86_400_000).toISOString(),
      validTo: new Date(Date.now() + 7 * 86_400_000).toISOString(), writer: 'MANUAL' } });
  const historical = query("SELECT count(*) FROM orders;");
  const balances = query('SELECT row_to_json(b)::text FROM inventory_balances b ORDER BY variant_id;');
  const ledger = query('SELECT row_to_json(l)::text FROM inventory_ledger l ORDER BY id;');
  const replay = await new ShowcaseLoader(config).run();
  assert.equal(replay.pendingOrderCreated, false);
  assert.deepEqual(replay.receipt, firstResult.receipt);
  assert.equal(query('SELECT count(*) FROM orders;'), historical);
  assert.equal(query('SELECT row_to_json(b)::text FROM inventory_balances b ORDER BY variant_id;'), balances);
  assert.equal(query('SELECT row_to_json(l)::text FROM inventory_ledger l ORDER BY id;'), ledger);
  const replayOffers = await first.context.admin.request('/api/v1/user/offers');
  assert.deepEqual(replayOffers.find(offer => offer.id === unrelated.id), unrelated);
  const replayPromos = await first.context.admin.request('/api/v1/user/promos');
  assert.deepEqual(replayPromos.items.find(promo => promo.id === seededPromo.id), seededPromo);
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
  const checkSafety = async () => {
  const safetyRead = await fetch('http://127.0.0.1:8080/api/v1/user/showcase-safety', {
    headers: { Cookie: browserCookie, Origin: httpsOrigin } });
  assert.equal(safetyRead.status, 200);
  const safety = (await safetyRead.json()).data;
  assert.equal(ShowcaseAdapterMode.fromWire(safety.mpOrdersAdapter), ShowcaseAdapterMode.Unconfigured);
  assert.equal(safety.externalCheckoutDisabled, true);
  const capabilities = safety.externalCapabilities;
  assert.ok(Array.isArray(capabilities));
  assert.equal(capabilities.length, ShowcaseExternalCapability.values.length);
  assert.equal(new Set(capabilities.map(row => row.module)).size, capabilities.length);
  for (const capability of ShowcaseExternalCapability.values) {
    assert.equal(ShowcaseCapabilityState.fromWire(capabilities.find(row =>
      ShowcaseExternalCapability.fromWire(row.module) === capability)?.state), ShowcaseCapabilityState.Disabled);
  }
  };
  await checkSafety();
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
  await checkSafety();
  const evidence = publishEvidence(process.env.STORECORE_PSD_RAW_REPORT);
  if (evidence.failures > 0 || evidence.routeAcceptances !== 90 || evidence.actionAcceptances !== 17) process.exitCode = 1;
  writeFileSync(join(results, 'runtime-summary.json'), `${JSON.stringify({ sha: process.env.GITHUB_SHA ?? 'local',
    externalSafetyBefore: true, externalSafetyAfter: true, ...evidence, exitCode: process.exitCode })}\n`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const child of children) terminate(child); process.exitCode = 1;
});
try {
  if (process.argv.includes('--check-security')) checkSecurityContracts();
  else await run();
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await Promise.all([...children].map(stop));
  await Promise.all(logs.map(log => new Promise(accept => log.end(accept))));
  rmSync(scratch, { recursive: true, force: true });
}
