import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
test('platform budget serializes requests and freezes failed tasks', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dreamhome-budget-'));
  const moduleUrl = pathToFileURL(path.resolve('server/lux3d/budget.mjs')).href;
  const script = `import { reservePlatform } from ${JSON.stringify(moduleUrl)};
const a = await reservePlatform('bed');
let locked = false; try { await reservePlatform('other'); } catch(e) { locked = e.status === 409; }
await a.update({status:'uncertain_or_failed'}); await a.release();
let duplicate = false; try { await reservePlatform('bed'); } catch(e) { duplicate = e.status === 409; }
console.log(JSON.stringify({locked,duplicate}));`;
  try { const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script], { cwd: dir }); assert.deepEqual(JSON.parse(stdout), { locked: true, duplicate: true }); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test('platform budget rejects submissions above the authorization ceiling', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dreamhome-budget-'));
  const moduleUrl = pathToFileURL(path.resolve('server/lux3d/budget.mjs')).href;
  const script = `import fs from 'node:fs/promises'; import { reservePlatform } from ${JSON.stringify(moduleUrl)};
await fs.mkdir('data/lux3d-v2',{recursive:true}); await fs.writeFile('data/lux3d-v2/reservations.json', JSON.stringify(Array.from({length:177},(_,i)=>({name:'existing'+i,frozenCredits:20}))));
try { await reservePlatform('extra'); process.exit(2); } catch(e) { if(e.status!==429) throw e; }`;
  try { await run(process.execPath, ['--input-type=module', '-e', script], { cwd: dir }); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
