import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
function install(home,...skills){return spawnSync(process.execPath,[join(root,'scripts/install.mjs'),...skills],{encoding:'utf8',env:{...process.env,HOME:home,CODEX_HOME:join(home,'custom-codex')}});}
test('installer migrates legacy instructions, preserves user content and is repeatable',async t=>{
  const home=await mkdtemp(join(tmpdir(),'lstack-install-'));t.after(()=>rm(home,{recursive:true}));
  await mkdir(join(home,'.codex'),{recursive:true});await mkdir(join(home,'.claude/projects'),{recursive:true});
  await writeFile(join(home,'.codex/AGENTS.md'),'User rules\n\n<!-- agent-visuals:start (managed by agent-visuals/install.sh) -->\nOld instructions\n<!-- agent-visuals:end -->\n');
  await writeFile(join(home,'.claude/CLAUDE.md'),`Claude rules\n@${root}/AGENTS.md\n`);
  const result=install(home,'remote-environment');assert.equal(result.status,0,result.stderr);
  assert.equal(await readlink(join(home,'.codex/skills/remote-environment')),join(root,'skills/remote-environment'));
  assert.equal(await readlink(join(home,'custom-codex/skills/remote-environment')),join(root,'skills/remote-environment'));
  const before=await readFile(join(home,'.codex/AGENTS.md'),'utf8');
  assert.match(before,/User rules/);assert.doesNotMatch(before,/Old instructions|agent-visuals:start/);assert.match(before,/remote-environment/);
  assert.equal(install(home,'remote-environment').status,0);
  assert.equal(await readFile(join(home,'.codex/AGENTS.md'),'utf8'),before);
  const claude=await readFile(join(home,'.claude/CLAUDE.md'),'utf8');assert.match(claude,/Claude rules/);assert.doesNotMatch(claude,/@.*AGENTS/);
});
test('installer refuses a real directory before changing any configuration',async t=>{
  const home=await mkdtemp(join(tmpdir(),'lstack-install-'));t.after(()=>rm(home,{recursive:true}));
  await mkdir(join(home,'custom-codex/skills/remote-environment'),{recursive:true});
  const result=install(home,'remote-environment');assert.notEqual(result.status,0);assert.match(result.stderr,/not a link/);
  await assert.rejects(readFile(join(home,'.codex/AGENTS.md')),{code:'ENOENT'});
});
test('remote-only shell installation works without dependencies, login or network',async t=>{
  const home=await mkdtemp(join(tmpdir(),'lstack-install-'));t.after(()=>rm(home,{recursive:true}));
  const result=spawnSync('bash',[join(root,'install.sh'),'remote-environment'],{encoding:'utf8',env:{...process.env,HOME:home,CODEX_HOME:''}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/no network or login/);
  const linked=spawnSync(process.execPath,[join(home,'.codex/skills/remote-environment/scripts/remote.mjs'),'--help'],{encoding:'utf8'});
  assert.equal(linked.status,0,linked.stderr);assert.match(linked.stdout,/files read --environment/);
  await assert.rejects(readFile(join(home,'.local/state/lstack/remote-environment/grant.json')),{code:'ENOENT'});
});

test('existing visuals answer executable retains CommonJS behavior',()=>{
  const result=spawnSync(process.execPath,[join(root,'skills/visuals/answer/serve.js')],{encoding:'utf8'});
  assert.equal(result.status,2);assert.match(result.stderr,/usage: serve.js/);assert.doesNotMatch(result.stderr,/require is not defined/);
});
