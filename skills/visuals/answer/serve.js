#!/usr/bin/env node
// Serve an answer page on the first free port 4800–4809 (127.0.0.1 only; reach it through the SSH tunnel).
//   node serve.js <page.html>        → prints the URL; every submit appends one line to answers.jsonl next to the page
// GET /answers returns what was saved so far. Files next to the page (images, SVGs) are served too.
const http = require('http'), fs = require('fs'), path = require('path');
const page = path.resolve(process.argv[2] || die('usage: serve.js <page.html>')), dir = path.dirname(page), log = path.join(dir, 'answers.jsonl');
const FONTS = path.join(__dirname, '..', 'kit', 'vendor', 'fonts');
const TYPES = { '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.json':'application/json' };
function die(m) { console.error(m); process.exit(2); }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), send = (code, body, type) => { res.writeHead(code, { 'content-type':type || 'text/plain', 'cache-control':'no-store' }); res.end(body); };
  if (req.method === 'POST' && url.pathname === '/answer') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    return req.on('end', () => {
      try { const a = JSON.parse(body); fs.appendFileSync(log, JSON.stringify({ ...a, at:new Date().toISOString() }) + '\n'); send(200, 'saved'); }
      catch { send(400, 'bad json'); }
    });
  }
  if (url.pathname === '/answers') return send(200, fs.existsSync(log) ? fs.readFileSync(log) : '', 'application/x-ndjson');
  let file = url.pathname === '/' ? page : url.pathname.startsWith('/_fonts/') ? path.join(FONTS, url.pathname.slice(8)) : path.join(dir, decodeURIComponent(url.pathname));
  file = path.normalize(file);
  if (!(file.startsWith(dir + path.sep) || file === page || file.startsWith(FONTS)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, 'not found');
  send(200, fs.readFileSync(file), TYPES[path.extname(file)]);
});
(function listen(port) {
  if (port > 4809) die('ports 4800–4809 are all busy');
  server.once('error', e => e.code === 'EADDRINUSE' ? listen(port + 1) : die(String(e)));
  server.listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/\nanswers → ${log}`));
})(4800);
