// dist/ klasorunu yerelde sunar: npm start
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const port = Number(process.env.PORT) || 8080;
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join('dist', path === '/' || path === '\\' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path)] || (path.length <= 1 ? types['.html'] : 'application/octet-stream') });
    res.end(body);
  } catch { res.writeHead(404); res.end('bulunamadı'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
