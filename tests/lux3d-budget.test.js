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
const options={balance:async()=>({availableCredits:1720})};
const a = await reservePlatform('bed',options);
let locked = false; try { await reservePlatform('other',options); } catch(e) { locked = e.status === 409; }
await a.update({status:'uncertain_or_failed'}); await a.release();
let duplicate = false; try { await reservePlatform('bed',options); } catch(e) { duplicate = e.status === 409; }
console.log(JSON.stringify({locked,duplicate}));`;
  try { const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script], { cwd: dir }); assert.deepEqual(JSON.parse(stdout), { locked: true, duplicate: true }); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test('platform budget rejects submissions above the authorization ceiling', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dreamhome-budget-'));
  const moduleUrl = pathToFileURL(path.resolve('server/lux3d/budget.mjs')).href;
  const script = `import fs from 'node:fs/promises'; import { reservePlatform } from ${JSON.stringify(moduleUrl)};
await fs.mkdir('data/lux3d-v2',{recursive:true}); await fs.writeFile('data/lux3d-v2/reservations.json', JSON.stringify(Array.from({length:177},(_,i)=>({name:'existing'+i,createdAt:new Date().toISOString(),frozenCredits:20}))));
try { await reservePlatform('extra'); process.exit(2); } catch(e) { if(e.status!==429) throw e; }`;
  try { await run(process.execPath, ['--input-type=module', '-e', script], { cwd: dir }); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test('credit floor includes unresolved legacy liability and live reservations', async () => {
  const {reserveCredits} = await import('../server/lux3d/credit-policy.mjs');
  const entries = [{name:'历史未知',status:'submission_uncertain_held',createdAt:'2026-11-19T09:00:00Z',frozenCredits:20}];
  const balance = async () => ({availableCredits:340});
  const entry = await reserveCredits(entries,'A',{balance});
  assert.equal(entry.frozenCredits,20);
  await assert.rejects(reserveCredits(entries,'B',{balance}), {status:429});
  assert.equal(entries.length,2);
});

test('only a terminal provider cost releases a known task reservation', async () => {
  const {reconcileTaskCosts} = await import('../server/lux3d/credit-policy.mjs');
  const entries=[{taskId:'1',status:'failed_confirmed',frozenCredits:20},{taskId:'2',status:'submitted',frozenCredits:20},{status:'uncertain_or_failed',frozenCredits:20}];
  assert.equal(reconcileTaskCosts(entries,[{taskId:'1',status:4,consumedCredits:0},{taskId:'2',status:1,consumedCredits:20}]),true);
  assert.deepEqual(entries.map(e=>e.frozenCredits),[0,20,20]);
  assert.equal(entries[0].actualCredits,0);
});

test('an input correction can retry one confirmed and refunded task just once', async () => {
  const {reserveCredits}=await import('../server/lux3d/credit-policy.mjs');
  const entry={name:'脚凳',taskId:'original',status:'failed_confirmed',actualCredits:0};
  const opts={retryOf:'original',balance:async()=>({availableCredits:1500})};
  const entries=[entry];
  await assert.rejects(reserveCredits([{...entry,actualCredits:null}],'脚凳',opts),{status:409});
  await reserveCredits(entries,'脚凳',opts);
  await assert.rejects(reserveCredits(entries,'脚凳',opts),{status:409});
});
