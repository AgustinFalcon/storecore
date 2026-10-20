import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist/storecore-demo/browser');
const mime = new Map([['.html','text/html'],['.js','text/javascript'],['.css','text/css'],['.svg','image/svg+xml'],['.map','application/json']]);
createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4390');
    const target = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (target !== root && !target.startsWith(root + sep)) { response.writeHead(400).end(); return; }
    let file = target; let body;
    try { body = await readFile(file); } catch { file = resolve(root, 'index.html'); body = await readFile(file); }
    response.writeHead(200, { 'content-type': mime.get(extname(file)) ?? 'application/octet-stream' }).end(body);
  } catch { response.writeHead(500).end(); }
}).listen(4390, '127.0.0.1');
