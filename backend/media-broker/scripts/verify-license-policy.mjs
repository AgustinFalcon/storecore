import { execFileSync } from 'node:child_process';

const accepted = new Set([
  '(MIT OR Apache-2.0) AND Unicode-3.0',
  'Apache-2.0 OR MIT',
  'MIT OR Apache-2.0',
  'MIT',
  'Unlicense OR MIT',
  'Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT',
  'Proprietary',
]);

const metadata = JSON.parse(execFileSync('cargo', [
  '+1.100.0',
  'metadata',
  '--locked',
  '--filter-platform',
  'x86_64-unknown-linux-gnu',
  '--format-version',
  '1',
], {
  encoding: 'utf8',
}));
const denied = metadata.packages
  .filter((dependency) => !accepted.has(dependency.license ?? ''))
  .map((dependency) => `${dependency.name}@${dependency.version}:${dependency.license ?? 'UNKNOWN'}`);

if (denied.length > 0) {
  throw new Error(`Unreviewed Rust dependency licenses: ${denied.join(', ')}`);
}

console.log(`Reviewed ${metadata.packages.length} Rust package licenses.`);
