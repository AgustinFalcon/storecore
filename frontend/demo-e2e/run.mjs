import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['demo-e2e/serve.mjs'], { stdio: 'inherit' });
const stop = () => { if (!server.killed) server.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch('http://127.0.0.1:4390/demo'); if (response.ok) { ready = true; break; } } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Demo server did not start.');
  const tests = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.demo.config.ts'], { stdio: 'inherit', env: { ...process.env, STORECORE_DEMO_EXTERNAL_SERVER: '1' } });
  process.exitCode = await new Promise(resolve => tests.on('exit', code => resolve(code ?? 1)));
} finally { stop(); }
