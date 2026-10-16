#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export { Account } from './account.ts';
export { Remote, execute, validateWritePath, verifiedWrite, makeSigner, secureOrigin } from './remote.ts';
export { withRpc } from './contract-client.ts';
import { Account, SafeError } from './account.ts';
import { Remote, execute, validateWritePath, verifiedWrite } from './remote.ts';
const help = `lstack remote-environment (Node 24+)
  auth login|status|logout
  environments list
  environment check --environment ID
  files browse --environment ID --path ~/ [--cwd /workspace]
  files stat --environment ID --path /absolute/file
  files read --environment ID --cwd /workspace --path relative/file
  files write --environment ID --cwd /workspace --path relative/file --input /local/file
  exec --environment ID --cwd /workspace --command 'command' [--timeout-ms 60000] [--max-output-bytes 1048576]
Every target operation requires an environment ID. JSON results; errors never contain server response bodies.
Auth login prints a device authorization URL and code for the user; it never launches a browser.
`;
const emit = (value: unknown) => process.stdout.write(JSON.stringify(value)+'\n');
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    environment: { type: 'string' }, cwd: { type: 'string' }, path: { type: 'string' }, input: { type: 'string' },
    command: { type: 'string' }, 'timeout-ms': { type: 'string' }, 'max-output-bytes': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help || positionals.length === 0) { process.stdout.write(help); return; }
  const [group, action] = positionals;
  const expected = group === 'exec' ? 1 : 2;
  if (positionals.length !== expected) throw new SafeError('Invalid command. Use --help.');
  const required = (key: keyof typeof values): string => {
    const value = values[key]; if (typeof value !== 'string' || !value.trim()) throw new SafeError(`Missing --${key}.`); return value;
  };
  const account = new Account(); const remote = new Remote(account);
  if (group === 'auth') {
    if (action === 'login') { await account.login(code => emit({ action: 'authorize', ...code })); emit({ authenticated: true, identity: await account.getIdentity() }); return; }
    if (action === 'status') { emit({ authenticated: true, identity: await account.getIdentity() }); return; }
    if (action === 'logout') { await account.revoke(); emit({ revoked: true }); return; }
    throw new SafeError('Unknown auth command.');
  }
  if (group === 'environments' && action === 'list') { emit({ environments: await remote.list() }); return; }
  const id = required('environment');
  if (group === 'environment' && action === 'check') { emit(await remote.check(id)); return; }
  if (group === 'exec') {
    const cwd = required('cwd'), command = required('command');
    const timeoutMs = Number(values['timeout-ms'] ?? 60_000), maxOutputBytes = Number(values['max-output-bytes'] ?? 1_048_576);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000 || !Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 16_777_216) throw new SafeError('Invalid timeout or output limit.');
    const result = await remote.connected(id, ['terminal:read', 'terminal:operate'], (api, os) => execute(api, os, { cwd, command, timeoutMs, maxOutputBytes }));
    emit({ environmentId: id, ...result }); if (result.exitCode !== 0) process.exitCode = 1; return;
  }
  if (group !== 'files' || !['browse','stat','read','write'].includes(action)) throw new SafeError('Unknown command. Use --help.');
  const path = required('path');
  const cwd = action === 'read' || action === 'write' ? required('cwd') : values.cwd;
  let contents: string | undefined;
  if (action === 'write') { validateWritePath(path); contents = await readFile(required('input'), 'utf8'); }
  const result = await remote.connected(id, action === 'write' ? ['filesystem:read','filesystem:write'] : ['filesystem:read'], async api => {
    if (action === 'browse') return api.browse({ partialPath: path, ...(cwd ? { cwd } : {}) });
    if (action === 'stat') return api.stat({ paths: [path] });
    if (action === 'read') return api.read({ cwd: cwd!, relativePath: path });
    try { return await verifiedWrite(api, { cwd: cwd!, relativePath: path, contents: contents! }); }
    catch (error) { if (error instanceof SafeError) throw error; throw new SafeError('Write or readback failed; the file may have changed. Inspect before retrying.', 'unknown'); }
  });
  emit({ environmentId: id, result });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().catch(error => { emit({ error: error instanceof SafeError ? error.message : 'Operation failed. Check sign-in, destination reachability and compatibility.', outcome: error instanceof SafeError ? error.outcome : 'failed' }); process.exitCode = 1; });
