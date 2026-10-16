import { lstat, mkdir, readFile, readdir, readlink, rename, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const home = homedir();
const requested = process.argv.slice(2);
if (!requested.length || requested.some(skill => !['visuals','remote-environment'].includes(skill))) throw Error('Select visuals and/or remote-environment.');
const read = path => readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
const exists = path => lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const configs = new Map();
configs.set(join(home, '.codex'), 'codex');
if (process.env.CODEX_HOME) configs.set(resolve(process.env.CODEX_HOME), 'codex');
for (const name of await readdir(home)) {
  if (name === '.claude' || name.startsWith('.claude_')) {
    const config = join(home, name);
    if ((await exists(config))?.isDirectory() && (await exists(join(config,'settings.json')) || await exists(join(config,'projects')))) configs.set(config, 'claude');
  }
}
// Preflight all destinations before making any links or changing instructions.
for (const [config] of configs) for (const skill of requested) {
  const destination = join(config, 'skills', skill);
  const info = await exists(destination);
  if (info && !info.isSymbolicLink()) throw Error(`${destination} exists and is not a link; left unchanged.`);
  if (info?.isSymbolicLink()) {
    const target = resolve(dirname(destination), await readlink(destination));
    // Only adopt our own links or the previous agent-visuals installation.
    if (target !== join(root,'skills',skill) && !(skill === 'visuals' && target.endsWith('/agent-visuals/skills/visuals')))
      throw Error(`${destination} belongs to another installation; left unchanged.`);
  }
}
for (const [config, kind] of configs) {
  await mkdir(join(config, 'skills'), {recursive:true});
  const installed = [];
  for (const skill of ['visuals','remote-environment']) {
    if (requested.includes(skill)) {
      const dest = join(config,'skills',skill), temporary = `${dest}.lstack-${process.pid}`;
      await symlink(join(root,'skills',skill), temporary);
      await rename(temporary, dest);
    }
    const info = await exists(join(config,'skills',skill));
    if (info?.isSymbolicLink() && resolve(dirname(join(config,'skills',skill)),await readlink(join(config,'skills',skill))) === join(root,'skills',skill)) installed.push(skill);
  }
  const instructions = kind === 'codex' ? join(config,'AGENTS.md') : join(config,'CLAUDE.md');
  let contents = await read(instructions);
  contents = contents.replace(/<!-- (?:agent-visuals|lstack):start[^\n]*-->\n[\s\S]*?<!-- (?:agent-visuals|lstack):end -->\n?/g,'');
  // Claude's old installer imported the previous repository instructions live.
  contents = contents.split('\n').filter(line => !(line === `@${root}/AGENTS.md` || /^@.*\/agent-visuals\/AGENTS\.md$/.test(line))).join('\n').trimEnd();
  const blocks = [];
  if (installed.includes('visuals')) blocks.push('When asked to see, show, visualise, sketch, diagram or compare something, use the visuals skill. If a picture would help unasked, offer it first.');
  if (installed.includes('remote-environment')) blocks.push('For authorized work on another Otterware environment, use the remote-environment skill: discover destinations and select one explicitly. Skill installation does not authorize remote actions or account sign-in.');
  await writeFile(instructions, `${contents}${contents ? '\n\n' : ''}<!-- lstack:start (managed by lstack/install.sh) -->\n${blocks.join('\n')}\n<!-- lstack:end -->\n`);
  console.log(`Installed ${installed.join(', ')} into ${config}`);
}
