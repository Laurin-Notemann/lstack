import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const pin = JSON.parse(await readFile(`${root}/skills/remote-environment/protocol.json`, 'utf8'));
const source = process.argv[2];
if (!source) throw new Error('Usage: npm run build:remote -- /path/to/otterware (at protocol.json revision)');
const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (revision !== pin.revision) throw new Error('Otterware revision differs from protocol.json; update the pin deliberately.');
const dirty = execFileSync('git', ['-C', source, 'status', '--porcelain', '--', 'packages/contracts/src'], {encoding:'utf8'}).trim();
if (dirty) throw new Error('Contract source has uncommitted changes.');
const result = await build({
  entryPoints: [`${root}/skills/remote-environment/scripts/cli.ts`],
  outfile: `${root}/skills/remote-environment/scripts/remote.mjs`,
  bundle: true, platform: 'node', format: 'esm', target: 'node24', minify: true,
  legalComments: 'eof', nodePaths: [`${root}/node_modules`],
  alias: { '@otterware-contracts': resolve(source, 'packages/contracts/src') },
  banner: { js: `// Generated from lstack TypeScript and otterware ${revision}. Rebuild with scripts/build-remote.mjs.` },
  metafile: true,
});
const inputs = Object.keys(result.metafile.inputs);
await writeFile(`${root}/skills/remote-environment/build-info.json`, JSON.stringify({ revision, effect: pin.effect, inputCount: inputs.length }, null, 2)+'\n');
