import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { CommerceScenarioConfig } from './load-commerce-scenarios.mjs';

const valid = () => ({
  baseUrl: 'http://127.0.0.1:8080', origin: 'https://localhost:4301', providerUrl: 'http://127.0.0.1:4302',
  adminEmail: 'admin@example.test', adminPassword: 'local-password', customerEmail: 'demo@storecore.invalid',
  journalPath: join(tmpdir(), 'storecore-commerce-test-journal.json'), receiptPath: join(tmpdir(), 'storecore-commerce-test-receipt.json'),
});

test('commerce runner accepts only loopback services and synthetic customer identity', () => {
  const config = new CommerceScenarioConfig(valid());
  assert.equal(config.origin, 'https://localhost:4301');
  assert.equal(config.providerUrl, 'http://127.0.0.1:4302');
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), baseUrl: 'https://storecore.example.test' }), /LOOPBACK_REQUIRED/);
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), providerUrl: 'https://localhost:4302' }), /LOOPBACK_REQUIRED/);
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), origin: 'https://storecore.example.test' }), /LOOPBACK_REQUIRED/);
  assert.throws(() => new CommerceScenarioConfig({ ...valid(), customerEmail: 'real@example.com' }), /INVALID_TLD/);
});
