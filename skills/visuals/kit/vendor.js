// Bundles the pinned Excalidraw into one classic script + copies its fonts, so builds never fetch code at run time.
const esbuild = require('esbuild'), fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'vendor'), pkg = path.join(__dirname, 'node_modules/@excalidraw/excalidraw');
fs.rmSync(out, { recursive:true, force:true }); fs.mkdirSync(out, { recursive:true });
esbuild.buildSync({
  stdin:{ contents:"export { convertToExcalidrawElements, exportToSvg, serializeAsJSON, restoreElements } from '@excalidraw/excalidraw';", resolveDir:__dirname },
  bundle:true, format:'iife', globalName:'ExcalidrawLib', minify:true, outfile:path.join(out, 'excalidraw.js'),
  define:{ 'process.env.NODE_ENV':'"production"' }, loader:{ '.css':'empty' }, logLevel:'error',
});
// Xiaolai (CJK, 13 MB) is left out; Excalidraw falls back to its CDN if a scene ever needs it.
for (const f of ['Excalifont', 'Nunito', 'ComicShanns', 'Virgil', 'Lilita', 'Cascadia'])
  fs.cpSync(path.join(pkg, 'dist/prod/fonts', f), path.join(out, 'fonts', f), { recursive:true });
console.log('vendored Excalidraw', JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'))).version, '→', out);
