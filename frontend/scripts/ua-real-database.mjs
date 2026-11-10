import { spawnSync } from 'node:child_process';

/** Only a dedicated disposable database is accepted, including from test workers. */
export function databaseEnvironment(source = process.env) {
  const database = source.PGDATABASE ?? 'storecore_ua_e2e';
  if (database !== 'storecore_ua_e2e') throw new Error('UA E2E requires PGDATABASE=storecore_ua_e2e');
  const host = source.PGHOST ?? '127.0.0.1';
  const port = source.PGPORT ?? '5434';
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error('UA database must be on loopback');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid UA database port');
  return { ...source, PGDATABASE: database, PGHOST: host,
    PGPORT: port, PGUSER: source.PGUSER ?? 'storecore',
    PGPASSWORD: source.PGPASSWORD ?? 'storecore' };
}

export function query(sql) {
  const env = databaseEnvironment();
  const psqlArgs = ['-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t'];
  const container = process.env.STORECORE_UA_POSTGRES_CONTAINER;
  if (container !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) {
    throw new Error('Invalid UA PostgreSQL container name');
  }
  const command = container === undefined ? (process.env.STORECORE_UA_PSQL ?? 'psql') : 'docker';
  const args = container === undefined
    ? psqlArgs
    : ['exec', '-i', container, 'psql', '-U', env.PGUSER, '-d', env.PGDATABASE, ...psqlArgs];
  const result = spawnSync(command, args, {
    env, input: sql, encoding: 'utf8', timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`UA fixture SQL failed: ${result.stderr}`);
  return result.stdout.trim();
}
