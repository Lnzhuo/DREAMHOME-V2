import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Lux3DProvider } from '../../src/providers/lux3d/node-provider.js';
import { loadServerEnv } from '../../server/env.mjs';
await loadServerEnv();
const root = path.resolve('data', 'lux3d-v2');
await fs.mkdir(root, { recursive: true });
const lock = path.join(root, 'batch.lock');
let handle;
try { handle = await fs.open(lock, 'wx'); } catch { throw new Error('已有批次运行或需人工核对遗留锁'); }
const ledgerPath = path.join(root, 'reservations.json');
const entries = await fs.readFile(ledgerPath, 'utf8').then(JSON.parse).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
let writing = Promise.resolve();
const write = () => { writing = writing.then(async () => { const tmp = ledgerPath + '.tmp'; await fs.writeFile(tmp, JSON.stringify(entries, null, 2)); await fs.rename(tmp, ledgerPath); }); return writing; };
const firstCatalog = [
  { name: '现代双人床', category: 'bed', prompt: 'A complete modern double bed, neutral beige upholstered headboard, mattress and simple oak frame, isolated furniture, no room, physically plausible proportions', dimensions: [1.8, 2.1, 1.0] },
  { name: '现代马桶', category: 'bathroom', prompt: 'A complete modern white ceramic floor mounted toilet, closed seat, tank and base, isolated product, no room', dimensions: [0.38, 0.7, 0.78] },
  { name: '现代冰箱', category: 'appliance', prompt: 'A complete modern freestanding two door refrigerator, matte off-white, isolated appliance, no room', dimensions: [0.7, 0.7, 1.8] },
];
const nextBatch = process.argv.includes('--next');
const thirdBatch = process.argv.includes('--third');
const catalog = thirdBatch ? JSON.parse(await fs.readFile(path.join(root, 'third-batch-candidates.json'), 'utf8')) : nextBatch ? JSON.parse(await fs.readFile(path.join(root, 'next-batch-candidates.json'), 'utf8')) : firstCatalog;
const provider = new Lux3DProvider({ env: { ...process.env, LUX3D_ALLOW_PAID_GENERATION: 'true' } });
try {
  if (nextBatch) {
    const check = JSON.parse(await fs.readFile(path.join(root, 'first-batch-quality.json'), 'utf8').catch(() => '{}'));
    if (!firstCatalog.every((item) => ['accepted', 'needs_review'].includes(check[item.name]))) throw new Error('首批尚未全部完成质量验收');
  }
  if (thirdBatch) {
    const previous = JSON.parse(await fs.readFile(path.join(root, 'next-batch-candidates.json'), 'utf8'));
    const check = JSON.parse(await fs.readFile(path.join(root, 'second-batch-quality.json'), 'utf8').catch(() => '{}'));
    if (!previous.every((item) => ['accepted', 'needs_review', 'rejected'].includes(check[item.name]))) throw new Error('第二批尚未全部完成质量验收');
    if (entries.some((e) => e.status !== 'archived')) throw new Error('存在结果不明或未归档任务，需要核对账单');
  }
  const pending = catalog.filter((item) => !entries.some((e) => e.name === item.name));
  if (entries.reduce((sum, e) => sum + (Number(e.frozenCredits) || 0), 0) + pending.length * 20 > 3540) throw new Error('冻结额度达到项目授权上限');
  for (const item of pending) entries.push({ name: item.name, expectedCredits: 20, actualCredits: null, frozenCredits: 20, status: 'reserved', createdAt: new Date().toISOString() });
  await write();
  for (const item of pending) {
    const entry = entries.find((e) => e.name === item.name);
    try {
      const taskId = await provider.createTextJob({ prompt: item.prompt, version: 'G1', faceCount: 60000 });
      entry.taskId = String(taskId); entry.status = 'submitted'; await write();
      console.log(`${item.name}: taskId ${entry.taskId} 已提交`);
    } catch (error) { entry.status = 'uncertain_or_failed'; entry.error = '需要检查任务及账单'; await write(); console.error(`${item.name}: 提交结果不明，停止提交`); break; }
  }
  await Promise.all(catalog.map(async (item) => {
    const entry = entries.find((e) => e.name === item.name);
    if (!entry?.taskId || entry.status !== 'submitted') return;
    try {
      const result = await provider.waitForJob(entry.taskId);
      const [w,d,h] = item.dimensions;
      const asset = { id: `asset-${crypto.randomUUID()}`, name: item.name, category: item.category, source: 'lux3d_text', providerTaskId: entry.taskId, prompt: item.prompt, licenseStatus: 'provider_terms_check', dimensions: { width: { value: w, unit: 'm', source: 'estimated' }, depth: { value: d, unit: 'm', source: 'estimated' }, height: { value: h, unit: 'm', source: 'estimated' } }, createdAt: new Date().toISOString() };
      entry.asset = await provider.downloadAndArchive({ outputs: result.outputs, asset, projectId: 'v2-generated' });
      entry.status = 'archived'; await write(); console.log(`${item.name}: 已归档`);
    } catch (error) { entry.status = 'uncertain_or_failed'; entry.error = '需要检查任务及账单'; await write(); console.error(`${item.name}: 任务未完成，冻结保留`); }
  }));
} finally { await handle.close(); await fs.unlink(lock); }
