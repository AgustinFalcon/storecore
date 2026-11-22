import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scripts = dirname(fileURLToPath(import.meta.url));
const authorization = { Authorization: 'Bearer cfe-local-provider-token', 'Content-Type': 'application/json' };
async function waitReady(child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Provider exited with ${child.exitCode}`);
    try { if ((await fetch('http://127.0.0.1:4302/health')).ok) return; } catch { /* retry bounded startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Provider readiness timed out');
}
async function start(journal) {
  const child = spawn(process.execPath, [join(scripts, 'cfe-official-provider.mjs')], {
    cwd: scripts,
    env: { ...process.env, CFE_PROVIDER_JOURNAL_PATH: journal },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitReady(child);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Provider stop timed out')), 5_000))]);
}
async function create(claim, input) {
  return fetch('http://127.0.0.1:4302/v1/orders', {
    method: 'POST', headers: { ...authorization, 'X-Idempotency-Key': claim }, body: JSON.stringify(input),
  });
}

test('provider journal preserves idempotency and accreditation across restart', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'storecore-cfe-provider-'));
  const journal = join(scratch, 'provider.json');
  const input = { external_reference: 'showcase-order-1', total_amount: 245, items: [{ sku: 'FF-001', quantity: 2 }] };
  let provider;
  try {
    provider = await start(journal);
    const first = await create('showcase-claim-1', input);
    assert.equal(first.status, 201);
    const created = await first.json();
    assert.match(created.id, /^cfe-/);
    const replay = await create('showcase-claim-1', { items: input.items, total_amount: 245, external_reference: 'showcase-order-1' });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).id, created.id);
    assert.equal((await create('showcase-claim-1', { ...input, total_amount: 246 })).status, 409);
    const accredited = await fetch(`http://127.0.0.1:4302/fixture/orders/${created.id}/accredit`, { method: 'POST', headers: authorization });
    assert.equal(accredited.status, 200);
    assert.equal((await accredited.json()).status_detail, 'accredited');
    await stop(provider);
    provider = await start(journal);
    const restored = await fetch(`http://127.0.0.1:4302/v1/orders/${created.id}`, { headers: authorization });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).status_detail, 'accredited');
    const replayAfterRestart = await create('showcase-claim-1', input);
    assert.equal(replayAfterRestart.status, 200);
    assert.equal((await replayAfterRestart.json()).id, created.id);
    const rawJournal = readFileSync(journal, 'utf8');
    assert.doesNotMatch(rawJournal, /cfe-local-provider-token|cfe-local-webhook-secret/);
  } finally {
    if (provider) await stop(provider);
    rmSync(scratch, { recursive: true, force: true });
  }
});
