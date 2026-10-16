#!/usr/bin/env node
// Build Excalidraw scenes headless, lint them, and write what the agent needs to check and show them.
//
//   node build.js <scene.js> [--out <dir>] [--only <name>]
//       → <name>.svg, <name>.inline.html (pass to html_render), <name>.png (2x, look at this), <name>.excalidraw (editable),
//         <name>.lint.png (red boxes on every problem, only when there are problems). Exit 1 on unaccepted problems.
//   node build.js lint <file.excalidraw>...      lint existing files (any Excalidraw file, also hand-made ones)
//   node build.js crop <file.svg> <x> <y> <w> <h> [out.png]   zoom into a region at 3x for a close look
const fs = require('fs'), path = require('path'), os = require('os');
const KIT = __dirname, VENDOR = path.join(KIT, 'vendor');
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { die('playwright-core missing: run `npm install` in ' + KIT); }
if (!fs.existsSync(path.join(VENDOR, 'excalidraw.js'))) die('vendor/ missing: run `npm install` in ' + KIT);

function die(msg) { console.error('build.js: ' + msg); process.exit(2); }

function findChrome() {
  if (process.env.CHROME) return { executablePath:process.env.CHROME };
  const home = os.homedir(), roots = [path.join(home, '.cache/ms-playwright'), path.join(home, 'Library/Caches/ms-playwright')];
  const tails = ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
                 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r).filter(d => /^chromium-\d+$/.test(d)).sort().reverse())
      for (const t of tails) { const p = path.join(r, d, t); if (fs.existsSync(p)) return { executablePath:p }; }
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'])
    if (fs.existsSync(p)) return { executablePath:p };
  die('no Chrome found: set CHROME=/path/to/chrome or run `npx playwright-core install chromium` in ' + KIT);
}

// Everything the page loads comes from http://kit.local/ and is served from disk; no network needed.
async function open(browser, sceneSrc) {
  const page = await browser.newPage({ viewport:{ width:1000, height:700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // nothing leaves the machine: anything not served from disk is blocked (and reported, so a missing asset is visible)
  await page.route(u => !u.href.startsWith('http://kit.local/') && !u.href.startsWith('data:'), r => { errors.push('blocked ' + r.request().url()); if (process.env.VIS_DEBUG) console.error('blocked', r.request().url()); r.abort(); });
  await page.route('http://kit.local/**', route => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/') return route.fulfill({ contentType:'text/html', body:PAGE });
    if (p === '/scene.js') return route.fulfill({ contentType:'text/javascript', body:sceneSrc || '' });
    const file = p === '/kit.js' ? path.join(KIT, 'kit.js') : path.join(VENDOR, p.replace(/^\/vendor\//, ''));
    if (!file.startsWith(KIT) || !fs.existsSync(file)) return route.fulfill({ status:404, body:'' });
    route.fulfill({ body:fs.readFileSync(file), contentType:file.endsWith('.js') ? 'text/javascript' : file.endsWith('.woff2') ? 'font/woff2' : undefined });
  });
  await page.goto('http://kit.local/');
  await page.waitForFunction(() => window.__ready || window.__fail, null, { timeout:60000 });
  const fail = await page.evaluate(() => window.__fail);
  if (fail) throw new Error(fail + (errors.length ? '\n' + errors.join('\n') : ''));
  return page;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>window.EXCALIDRAW_ASSET_PATH = 'http://kit.local/vendor/'; const __scenes = [];
function scene(name, fn, opts) { __scenes.push({ name, fn, opts:opts || {} }); }</script>
<script src="http://kit.local/vendor/excalidraw.js"></script><script src="http://kit.local/kit.js"></script>
<script src="http://kit.local/scene.js"></script>
<script>(async () => { try { window.K = Kit(ExcalidrawLib); await K.warmup(); window.__ready = true; }
  catch (e) { window.__fail = String(e && e.stack || e); } })();</script></body></html>`;

async function png(browser, svg, w, h, file, clip, scale = 2) {
  const q = await browser.newPage({ viewport:{ width:Math.ceil(+w) + 20, height:Math.ceil(+h) + 20 }, deviceScaleFactor:scale });
  await q.setContent(`<body style="margin:10px;background:#fff">${svg}</body>`); await q.waitForTimeout(300);
  await q.screenshot({ path:file, ...(clip ? { clip } : {}) }); await q.close();
}

// Page for Otter Code's html_render: the image path must appear literally (only literal absolute paths get inlined);
// in dark mode the white drawing is inverted so it sits on the thread background.
function inline(svgPath) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>img{width:100%;display:block}</style></head><body>
<img class="x" src="${svgPath}">
<script>
const c = getComputedStyle(document.documentElement).getPropertyValue('--background').trim(), m = document.createElement('canvas').getContext('2d');
m.fillStyle = c; m.fillRect(0, 0, 1, 1); const [r, g, b] = m.getImageData(0, 0, 1, 1).data;
if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5) document.querySelectorAll('img.x').forEach(i => i.style.filter = 'invert(93%) hue-rotate(180deg)');
</script></body></html>
`;
}

function report(name, lint, accepted) {
  const open = lint.issues.filter(i => !accepted[i.kind]), ok = lint.issues.filter(i => accepted[i.kind]);
  console.log(`\n${name}: ${open.length ? open.length + ' problem(s)' : 'clean'} · width ${lint.width}px · scale in the 728px column ${lint.scale}`);
  for (const i of open) console.log('  ✗', i.kind.padEnd(16), i.msg);
  for (const i of ok) console.log('  ~', i.kind.padEnd(16), i.msg, `(accepted: ${accepted[i.kind]})`);
  return open.length;
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) die('usage: build.js <scene.js> [--out dir] [--only name] | lint <file.excalidraw>... | crop <file.svg> x y w h [out.png]');
  const browser = await chromium.launch(findChrome());
  let failed = 0;
  try {
    if (cmd === 'crop') {
      const [file, x, y, w, h, outFile] = rest, svg = fs.readFileSync(file, 'utf8');
      const W = +svg.match(/width="([\d.]+)"/)[1], H = +svg.match(/height="([\d.]+)"/)[1], out = outFile || file.replace(/\.svg$/, `.crop-${x}-${y}.png`);
      await png(browser, svg, W, H, out, { x:+x + 10, y:+y + 10, width:+w, height:+h }, 3);
      console.log(out);
    } else if (cmd === 'lint') {
      const page = await open(browser, '');
      for (const f of rest) {
        const r = await page.evaluate(async json => {
          const els = JSON.parse(json).elements, lint = K.lint(els);
          const dbg = await ExcalidrawLib.exportToSvg({ elements:[...els, ...K.marks(lint.issues)], appState:{ exportBackground:false, viewBackgroundColor:'#fff' }, files:null, exportPadding:12 });
          return { lint, debug:dbg.outerHTML, w:dbg.getAttribute('width'), h:dbg.getAttribute('height') };
        }, fs.readFileSync(f, 'utf8'));
        failed += report(path.basename(f), r.lint, {});
        if (r.lint.issues.length) { const o = f.replace(/\.excalidraw$/, '') + '.lint.png'; await png(browser, r.debug, r.w, r.h, o); console.log('  marks →', o); }
      }
    } else {
      const sceneFile = path.resolve(cmd), arg = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
      const outDir = path.resolve(arg('--out') || path.dirname(sceneFile)), only = arg('--only');
      fs.mkdirSync(outDir, { recursive:true });
      const page = await open(browser, fs.readFileSync(sceneFile, 'utf8'));
      const names = await page.evaluate(() => __scenes.map(s => s.name));
      if (!names.length) die(`no scene(...) calls in ${sceneFile}`);
      for (const name of names.filter(n => !only || n === only)) {
        const r = await page.evaluate(async name => {
          const sc = __scenes.find(s => s.name === name), s = K.scene(sc.opts);
          const res = sc.fn(K, s); const els = Array.isArray(res) ? res : s.els;
          const out = await K.exportScene(els); out.accept = sc.opts.accept || {}; return out;
        }, name);
        const base = path.join(outDir, name);
        fs.writeFileSync(base + '.svg', r.svg); fs.writeFileSync(base + '.excalidraw', r.json);
        await png(browser, r.svg, r.w, r.h, base + '.png');
        fs.writeFileSync(base + '.inline.html', inline(base + '.svg'));
        fs.rmSync(base + '.lint.png', { force:true });
        failed += report(name, r.lint, r.accept);
        if (r.lint.issues.some(i => !r.accept[i.kind])) { await png(browser, r.debug, r.w, r.h, base + '.lint.png'); console.log('  marks →', base + '.lint.png'); }
        console.log('  svg   →', base + '.svg', `(${Math.round(r.svg.length / 1024)} KB)`);
        console.log('  look  →', base + '.png');
        console.log('  show  →', base + '.inline.html');
      }
    }
  } catch (e) { console.error(String(e.stack || e)); failed = 1; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
