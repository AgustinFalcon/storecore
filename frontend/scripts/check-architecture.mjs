import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { domainBoundaryFailures } from './domain-boundary.mjs';

const root = join(import.meta.dirname, '..');
const src = join(root, 'src', 'app');
const failures = [];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(src).filter((path) => path.endsWith('.ts'));

for (const file of files) {
  const rel = relative(src, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');

  failures.push(...domainBoundaryFailures(rel, text));

  if (/(class\s+\w*(Fixture|InMemory)\w*|universal-tools-profile|store_id\s*[:=])/i.test(text)) {
    failures.push(`${rel}: production lane cannot register fixtures, Universal Tools or store_id`);
  }

  if (rel.endsWith('.view.ts') && (text.includes('ComponentStore') || text.includes('HttpClient') || text.includes('UseCase'))) {
    failures.push(`${rel}: view must stay presentational (no Store, HTTP or UseCase)`);
  }
}

const appConfig = readFileSync(join(src, 'app.config.ts'), 'utf8');
if (!appConfig.includes('HealthHttpRepository') || !appConfig.includes('CatalogHttpRepository')) {
  failures.push('app.config.ts must bind HTTP repositories only');
}
if (/InMemory|Fixture/.test(appConfig)) {
  failures.push('app.config.ts must not register a fixture repository');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Architecture scan passed: Container → View → Store → UseCase → HTTP repository.');
