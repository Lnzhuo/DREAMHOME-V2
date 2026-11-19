import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('data', 'lux3d-v2');
const ledger = path.join(root, 'reservations.json');
const lock = path.join(root, 'batch.lock');
const limit = 3540; // 3600 project authorization minus three confirmed 20-credit tasks.
async function read() { try { return JSON.parse(await fs.readFile(ledger, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
async function write(entries) { const tmp = `${ledger}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(entries, null, 2), { flag: 'wx' }); await fs.rename(tmp, ledger); }
export async function reservePlatform(name) {
  await fs.mkdir(root, { recursive: true });
  let handle;
  try { handle = await fs.open(lock, 'wx'); } catch { const error = new Error('已有平台任务正在处理或需核查遗留锁'); error.status = 409; throw error; }
  try {
    if (['奶油色沙发', '原木茶几', '落地灯'].includes(name)) { const error = new Error('已有资产请复用，不能重复生成'); error.status = 409; throw error; }
    const entries = await read();
    if (entries.some((entry) => entry.name === name)) { const error = new Error('该名称已有任务或冻结记录，请先核查，不能重复提交'); error.status = 409; throw error; }
    if (entries.reduce((sum, entry) => sum + (Number(entry.frozenCredits) || 0), 0) + 20 > limit) { const error = new Error('平台积分授权额度不足'); error.status = 429; throw error; }
    if (entries.some((entry) => ['reserved', 'submitted', 'uncertain_or_failed'].includes(entry.status))) { const error = new Error('存在未完成或结果不明任务，请先核查'); error.status = 409; throw error; }
    const entry = { name, expectedCredits: 20, actualCredits: null, frozenCredits: 20, status: 'reserved', createdAt: new Date().toISOString() };
    entries.push(entry); await write(entries);
    return { async update(patch) { Object.assign(entry, patch); await write(entries); }, async release() { await handle.close(); await fs.unlink(lock); } };
  } catch (error) { await handle.close(); await fs.unlink(lock); throw error; }
}
