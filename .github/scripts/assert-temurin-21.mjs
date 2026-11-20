import { execFileSync } from 'node:child_process';

const EXPECTED_VENDOR = 'Eclipse Adoptium';
const EXPECTED_RUNTIME_PREFIX = '21.0.13+9';
const EXPECTED_VM_NAME = 'OpenJDK 64-Bit Server VM';

const output = execFileSync('java', ['-XshowSettings:properties', '-version'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const properties = new Map();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^\s+([A-Za-z0-9._-]+) = (.*)$/);
  if (match) properties.set(match[1], match[2]);
}

const vendor = properties.get('java.vendor') ?? '';
const runtime = properties.get('java.runtime.version') ?? '';
const vmName = properties.get('java.vm.name') ?? '';
const vendorVersion = properties.get('java.vendor.version') ?? '';

if (vendor !== EXPECTED_VENDOR) {
  throw new Error(`java.vendor expected ${EXPECTED_VENDOR}, got ${vendor}`);
}
if (!runtime.startsWith(EXPECTED_RUNTIME_PREFIX)) {
  throw new Error(`java.runtime.version expected prefix ${EXPECTED_RUNTIME_PREFIX}, got ${runtime}`);
}
if (vmName !== EXPECTED_VM_NAME) {
  throw new Error(`java.vm.name expected ${EXPECTED_VM_NAME}, got ${vmName}`);
}
if (!vendorVersion.includes('Temurin') && !output.includes('Temurin')) {
  throw new Error(`Temurin identity missing from java properties: ${vendorVersion}`);
}

process.stdout.write(
  `pinned java runtime ${runtime} vendor ${vendor} vm ${vmName}\n`,
);
