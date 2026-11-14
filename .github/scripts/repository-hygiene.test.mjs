import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  RepositoryHygieneError,
  RepositoryPathDisposition,
  SignatureScanner,
  parseIndex,
  runRepositoryHygiene,
} from './repository-hygiene.mjs';

function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'storecore-hygiene-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, ['init', '--quiet']);
  git(cwd, ['config', 'user.name', 'Repository Hygiene Test']);
  git(cwd, ['config', 'user.email', 'hygiene@example.invalid']);
  return cwd;
}

function track(cwd, path, content, force = false) {
  const absolute = join(cwd, ...path.split('/'));
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
  git(cwd, ['add', ...(force ? ['--force'] : []), '--', path]);
}

async function rejectsWithCode(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof RepositoryHygieneError);
    assert.equal(error.code, code);
    return true;
  });
}

test('closed path policy allows templates and named SQL assets', () => {
  assert.equal(RepositoryPathDisposition.fromPath('backend/.env.example').allowed, true);
  assert.equal(
    RepositoryPathDisposition.fromPath('backend/src/main/resources/db/migration/V1__core.sql').allowed,
    true,
  );
  assert.equal(
    RepositoryPathDisposition.fromPath('frontend/e2e-real/fixtures/identities.sql').allowed,
    true,
  );
});

test('closed path policy rejects sensitive and unknown paths', () => {
  assert.equal(RepositoryPathDisposition.fromPath('backend/.env.local').allowed, false);
  assert.equal(RepositoryPathDisposition.fromPath('frontend/private.pem').allowed, false);
  assert.equal(RepositoryPathDisposition.fromPath('tmp/export.sql').allowed, false);
  assert.equal(RepositoryPathDisposition.fromPath('../escape.txt').allowed, false);
});

test('current index content wins over a clean working-tree replacement', async (t) => {
  const cwd = repository(t);
  const privateKeyMarker = '-----BEGIN ' + 'PRIVATE KEY-----';
  track(cwd, 'src/config.txt', `${privateKeyMarker}\nsynthetic\n`);
  writeFileSync(join(cwd, 'src/config.txt'), 'clean working tree\n');
  await rejectsWithCode(
    () => runRepositoryHygiene({ cwd }),
    'CONTENT_PRIVATE_KEY_HEADER',
  );
});

test('force-added forbidden path cannot bypass the gate', async (t) => {
  const cwd = repository(t);
  writeFileSync(join(cwd, '.gitignore'), '**/.env\n');
  git(cwd, ['add', '.gitignore']);
  track(cwd, 'backend/.env', 'SYNTHETIC=value\n', true);
  await rejectsWithCode(
    () => runRepositoryHygiene({ cwd }),
    'PATH_FORBIDDEN_SENSITIVE_PATH',
  );
});

test('binary markers and padding do not suppress signature detection', async (t) => {
  const cwd = repository(t);
  const padded = Buffer.concat([
    Buffer.alloc(96 * 1024, 0),
    Buffer.from('-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\nsynthetic\n'),
  ]);
  track(cwd, 'assets/blob.bin', padded);
  await rejectsWithCode(
    () => runRepositoryHygiene({ cwd }),
    'CONTENT_PRIVATE_KEY_HEADER',
  );
});

test('signature scanner preserves a signature split across chunks', () => {
  const scanner = new SignatureScanner();
  scanner.push(Buffer.from('prefix-----BEGIN OPEN'));
  scanner.push(Buffer.from('SSH PRIVATE KEY-----suffix'));
  assert.equal(scanner.result(), 'PRIVATE_KEY_HEADER');
});

test('encrypted PKCS8 key header is rejected from the staged blob', async (t) => {
  const cwd = repository(t);
  const marker = '-----BEGIN ' + 'ENCRYPTED PRIVATE KEY-----';
  track(cwd, 'config/runtime.txt', `${marker}\nsynthetic\n`);
  await rejectsWithCode(
    () => runRepositoryHygiene({ cwd }),
    'CONTENT_PRIVATE_KEY_HEADER',
  );
});

test('fine-grained GitHub token shape is detected across chunks', () => {
  const scanner = new SignatureScanner();
  scanner.push(Buffer.from('prefixgithub_'));
  scanner.push(Buffer.from('pat_' + 'A'.repeat(82)));
  assert.equal(scanner.result(), 'GITHUB_FINE_GRAINED_TOKEN_SHAPE');
});

test('unresolved index stages fail closed', async (t) => {
  const cwd = repository(t);
  writeFileSync(join(cwd, 'conflict.txt'), 'base\n');
  const objectId = git(cwd, ['hash-object', '-w', 'conflict.txt']).trim();
  git(cwd, ['update-index', '--index-info'], {
    input: `100644 ${objectId} 1\tconflict.txt\n100644 ${objectId} 2\tconflict.txt\n`,
  });
  await rejectsWithCode(() => runRepositoryHygiene({ cwd }), 'UNRESOLVED_INDEX_STAGE');
});

test('unsupported Git modes and malformed records fail closed', () => {
  const oid = 'a'.repeat(40);
  assert.throws(
    () => parseIndex(Buffer.from(`120000 ${oid} 0\tlink\0`)),
    (error) => error.code === 'UNSUPPORTED_GIT_MODE',
  );
  assert.throws(
    () => parseIndex(Buffer.from('not-an-index-record\0')),
    (error) => error.code === 'MALFORMED_INDEX_RECORD',
  );
});

test('blob read failures fail closed without exposing content', async (t) => {
  const cwd = repository(t);
  track(cwd, 'README.md', 'safe\n');
  await rejectsWithCode(
    () =>
      runRepositoryHygiene({
        cwd,
        scanBlob: async (_cwd, entry) => {
          throw new RepositoryHygieneError('GIT_BLOB_READ_FAILED', entry.path);
        },
      }),
    'GIT_BLOB_READ_FAILED',
  );
});
