import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const POLICY_TOKEN = Symbol('RepositoryPathDisposition');

export class RepositoryPathDisposition {
  static AllowedSource = new RepositoryPathDisposition(
    POLICY_TOKEN,
    'ALLOWED_SOURCE',
    true,
  );
  static AllowedEnvironmentTemplate = new RepositoryPathDisposition(
    POLICY_TOKEN,
    'ALLOWED_ENVIRONMENT_TEMPLATE',
    true,
  );
  static AllowedSqlAsset = new RepositoryPathDisposition(
    POLICY_TOKEN,
    'ALLOWED_SQL_ASSET',
    true,
  );
  static ForbiddenSensitivePath = new RepositoryPathDisposition(
    POLICY_TOKEN,
    'FORBIDDEN_SENSITIVE_PATH',
    false,
  );
  static Unknown = new RepositoryPathDisposition(POLICY_TOKEN, 'UNKNOWN', false);

  constructor(token, code, allowed) {
    if (token !== POLICY_TOKEN) {
      throw new TypeError('RepositoryPathDisposition is closed');
    }
    this.code = code;
    this.allowed = allowed;
    Object.freeze(this);
  }

  static fromPath(rawPath) {
    if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.includes('\0')) {
      return RepositoryPathDisposition.Unknown;
    }

    const path = rawPath.replaceAll('\\', '/');
    const segments = path.split('/');
    if (
      path.startsWith('/') ||
      /^[A-Za-z]:\//.test(path) ||
      segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      return RepositoryPathDisposition.Unknown;
    }

    const basename = segments.at(-1).toLowerCase();
    if (basename === '.env.example' || basename === '.env.sample') {
      return RepositoryPathDisposition.AllowedEnvironmentTemplate;
    }
    if (basename === '.env' || basename.startsWith('.env.')) {
      return RepositoryPathDisposition.ForbiddenSensitivePath;
    }

    if (
      /\.(?:pem|key|p12|pfx|jks|keystore|ppk|kdbx|dump|bak|backup|sqlite|sqlite3|db)$/i.test(
        basename,
      ) ||
      /^(?:credentials|secrets?)(?:\.(?:json|ya?ml|toml|ini))?$/i.test(basename)
    ) {
      return RepositoryPathDisposition.ForbiddenSensitivePath;
    }

    if (basename.endsWith('.sql')) {
      if (
        /^backend\/src\/main\/resources\/db\/migration\/[^/]+\.sql$/i.test(path) ||
        /^frontend\/e2e-real\/fixtures\/[^/]+\.sql$/i.test(path)
      ) {
        return RepositoryPathDisposition.AllowedSqlAsset;
      }
      return RepositoryPathDisposition.ForbiddenSensitivePath;
    }

    return RepositoryPathDisposition.AllowedSource;
  }
}

const SIGNATURES = Object.freeze([
  Object.freeze({
    code: 'PRIVATE_KEY_HEADER',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  }),
  Object.freeze({
    code: 'GITHUB_TOKEN_SHAPE',
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}/,
  }),
  Object.freeze({
    code: 'GITHUB_FINE_GRAINED_TOKEN_SHAPE',
    pattern: /github_pat_[A-Za-z0-9_]{20,}/,
  }),
  Object.freeze({
    code: 'AWS_ACCESS_KEY_SHAPE',
    pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/,
  }),
]);

const MAX_SIGNATURE_LENGTH = 160;

const BATCH_PHASE_TOKEN = Symbol('BatchReadPhase');

class BatchReadPhase {
  static Header = new BatchReadPhase(BATCH_PHASE_TOKEN, 'HEADER');
  static Content = new BatchReadPhase(BATCH_PHASE_TOKEN, 'CONTENT');
  static Delimiter = new BatchReadPhase(BATCH_PHASE_TOKEN, 'DELIMITER');
  static Unknown = new BatchReadPhase(BATCH_PHASE_TOKEN, 'UNKNOWN');

  constructor(token, code) {
    if (token !== BATCH_PHASE_TOKEN) throw new TypeError('BatchReadPhase is closed');
    this.code = code;
    Object.freeze(this);
  }
}

export class SignatureScanner {
  #carry = '';
  #match = null;

  push(chunk) {
    if (this.#match !== null) return;
    const text = this.#carry + Buffer.from(chunk).toString('latin1');
    for (const signature of SIGNATURES) {
      if (signature.pattern.test(text)) {
        this.#match = signature.code;
        return;
      }
    }
    this.#carry = text.slice(-(MAX_SIGNATURE_LENGTH - 1));
  }

  result() {
    return this.#match;
  }
}

export class RepositoryHygieneError extends Error {
  constructor(code, path = null) {
    super(path === null ? code : `${code}: ${path}`);
    this.name = 'RepositoryHygieneError';
    this.code = code;
    this.path = path;
  }
}

export function parseIndex(buffer) {
  const entries = [];
  const paths = new Set();
  for (const rawRecord of Buffer.from(buffer).toString('utf8').split('\0')) {
    if (rawRecord.length === 0) continue;
    const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/.exec(rawRecord);
    if (match === null) throw new RepositoryHygieneError('MALFORMED_INDEX_RECORD');

    const [, mode, objectId, stage, path] = match;
    if (stage !== '0') throw new RepositoryHygieneError('UNRESOLVED_INDEX_STAGE', path);
    if (mode !== '100644' && mode !== '100755') {
      throw new RepositoryHygieneError('UNSUPPORTED_GIT_MODE', path);
    }
    if (paths.has(path)) throw new RepositoryHygieneError('DUPLICATE_INDEX_PATH', path);
    paths.add(path);
    entries.push(Object.freeze({ mode, objectId, path }));
  }
  return Object.freeze(entries);
}

function readIndex(cwd) {
  try {
    return execFileSync(
      'git',
      ['-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, 'ls-files', '--stage', '-z'],
      {
      cwd,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    throw new RepositoryHygieneError('GIT_INDEX_READ_FAILED');
  }
}

export function scanIndexBlobs(cwd, entries) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      [
        '-c',
        `safe.directory=${cwd.replaceAll('\\', '/')}`,
        'cat-file',
        '--batch',
      ],
      {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    const matches = new Map();
    let pending = Buffer.alloc(0);
    let entryIndex = 0;
    let remaining = 0;
    let scanner = null;
    let phase = BatchReadPhase.Header;
    let settled = false;

    const fail = (code, path = entries[entryIndex]?.path ?? null) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new RepositoryHygieneError(code, path));
    };

    child.on('error', () => fail('GIT_BLOB_READ_FAILED'));
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      while (pending.length > 0 && entryIndex < entries.length) {
        if (phase === BatchReadPhase.Header) {
          const newline = pending.indexOf(0x0a);
          if (newline === -1) return;
          const header = pending.subarray(0, newline).toString('ascii');
          pending = pending.subarray(newline + 1);
          const match = /^([0-9a-f]{40,64}) blob ([0-9]+)$/.exec(header);
          if (match === null || match[1] !== entries[entryIndex].objectId) {
            fail('GIT_BLOB_HEADER_INVALID');
            return;
          }
          remaining = Number.parseInt(match[2], 10);
          if (!Number.isSafeInteger(remaining) || remaining < 0) {
            fail('GIT_BLOB_SIZE_INVALID');
            return;
          }
          scanner = new SignatureScanner();
          phase = remaining === 0 ? BatchReadPhase.Delimiter : BatchReadPhase.Content;
        }

        if (phase === BatchReadPhase.Content) {
          const take = Math.min(remaining, pending.length);
          scanner.push(pending.subarray(0, take));
          pending = pending.subarray(take);
          remaining -= take;
          if (remaining > 0) return;
          phase = BatchReadPhase.Delimiter;
        }

        if (phase === BatchReadPhase.Delimiter) {
          if (pending.length === 0) return;
          if (pending[0] !== 0x0a) {
            fail('GIT_BLOB_DELIMITER_INVALID');
            return;
          }
          pending = pending.subarray(1);
          matches.set(entries[entryIndex].path, scanner.result());
          entryIndex += 1;
          scanner = null;
          phase = BatchReadPhase.Header;
        }
      }
    });
    child.on('close', (code) => {
      if (settled) return;
      if (
        code !== 0 ||
        entryIndex !== entries.length ||
        phase !== BatchReadPhase.Header ||
        pending.length !== 0
      ) {
        fail('GIT_BLOB_READ_FAILED');
        return;
      }
      settled = true;
      resolve(matches);
    });
    child.stdin.on('error', () => fail('GIT_BLOB_READ_FAILED'));
    child.stdin.end(`${entries.map((entry) => entry.objectId).join('\n')}\n`);
  });
}

export async function runRepositoryHygiene({ cwd = process.cwd(), scanBlob = null } = {}) {
  const entries = parseIndex(readIndex(cwd));
  for (const entry of entries) {
    const disposition = RepositoryPathDisposition.fromPath(entry.path);
    if (!disposition.allowed) {
      throw new RepositoryHygieneError(`PATH_${disposition.code}`, entry.path);
    }
  }

  const matches =
    scanBlob === null
      ? await scanIndexBlobs(cwd, entries)
      : new Map(
          await Promise.all(
            entries.map(async (entry) => [entry.path, await scanBlob(cwd, entry)]),
          ),
        );
  for (const entry of entries) {
    const signature = matches.get(entry.path);
    if (signature !== null) throw new RepositoryHygieneError(`CONTENT_${signature}`, entry.path);
  }
  return Object.freeze({ checkedFiles: entries.length });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  try {
    const result = await runRepositoryHygiene();
    process.stdout.write(`Repository hygiene PASS (${result.checkedFiles} tracked files)\n`);
  } catch (error) {
    const message = error instanceof RepositoryHygieneError ? error.message : 'UNEXPECTED_GATE_FAILURE';
    process.stderr.write(`Repository hygiene FAIL: ${message}\n`);
    process.exitCode = 1;
  }
}
