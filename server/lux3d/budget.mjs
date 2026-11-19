import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('data', 'lux3d-v2');
const ledger = path.join(root, 'reservations.json');
const lock = path.join(root, 'batch.lock');
import { reserveCredits } from './credit-policy.mjs';
async function read() { try { return JSON.parse(await fs.readFile(ledger, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
async function write(entries) { const tmp = `${ledger}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(entries, null, 2), { flag: 'wx' }); await fs.rename(tmp, ledger); }
export async function reservePlatform(name, options) {
  await fs.mkdir(root, { recursive: true });
  let handle;
  try { handle = await fs.open(lock, 'wx'); } catch { const error = new Error('已有平台任务正在处理或需核查遗留锁'); error.status = 409; throw error; }
  try {
    if (['奶油色沙发', '原木茶几', '落地灯'].includes(name)) { const error = new Error('已有资产请复用，不能重复生成'); error.status = 409; throw error; }
    const entries = await read();
    if (entries.some((entry) => entry.name === name)) { const error = new Error('该名称已有任务或冻结记录，请先核查，不能重复提交'); error.status = 409; throw error; }
    if (entries.some((entry) => ['reserved', 'submitted', 'uncertain_or_failed'].includes(entry.status))) { const error = new Error('存在未完成或结果不明任务，请先核查'); error.status = 409; throw error; }
    const entry = await reserveCredits(entries, name, options);
    await write(entries);
    return { async update(patch) { Object.assign(entry, patch); await write(entries); }, async release() { await handle.close(); await fs.unlink(lock); } };
  } catch (error) { await handle.close(); await fs.unlink(lock); throw error; }
}
