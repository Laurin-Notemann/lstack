import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/typecheck.mjs /path/to/pinned/otterware');
const temporary = await mkdtemp(join(tmpdir(), 'lstack-types-'));
try {
  const config = join(temporary, 'tsconfig.json');
  await writeFile(config, JSON.stringify({ compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true, types: ['node'], typeRoots: [`${root}/node_modules/@types`], paths: { '@otterware-contracts/*': [`${resolve(source)}/packages/contracts/src/*`], 'effect': [`${root}/node_modules/effect/dist/index.d.ts`], 'effect/*': [`${root}/node_modules/effect/dist/*.d.ts`] } }, include: [`${root}/skills/remote-environment/scripts/*.ts`] }));
  const result = spawnSync(process.execPath, [`${root}/node_modules/typescript/bin/tsc`, '-p', config], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(temporary, { recursive: true }); }
