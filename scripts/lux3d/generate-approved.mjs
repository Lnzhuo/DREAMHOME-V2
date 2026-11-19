import fs from 'node:fs/promises';
import path from 'node:path';
import { loadServerEnv } from '../../server/env.mjs';

await loadServerEnv();
const approvedCount = Number(process.env.APPROVED_GENERATION_COUNT || 1);
const maxCredits = Number(process.env.LUX3D_MAX_CREDITS || 3600);
if (process.env.LUX3D_ALLOW_PAID_GENERATION !== 'true' || !Number.isInteger(approvedCount) || approvedCount < 1 || approvedCount > 3 || !Number.isFinite(maxCredits) || maxCredits <= 0) {
  console.error('需要 LUX3D_ALLOW_PAID_GENERATION=true、APPROVED_GENERATION_COUNT=1..3，以及有效的 LUX3D_MAX_CREDITS 额度上限。');
  process.exit(2);
}
if (approvedCount * 20 > maxCredits) {
  console.error(`预计消耗 ${approvedCount * 20} 积分，超过本次允许的 ${maxCredits} 积分上限。`);
  process.exit(2);
}

const catalog = [
  { name: '奶油色沙发', prompt: '一件现代奶油风双人沙发，米白色布艺，圆润饱满，完整家具主体，无房间背景', dimensions: [2.2, 0.95, 0.85], category: 'sofa' },
  { name: '原木茶几', prompt: '一张圆形原木茶几，浅橡木色，简洁圆润桌面和稳固桌腿，完整家具主体，无房间背景', dimensions: [1.1, 1.1, 0.42], category: 'table' },
  { name: '落地灯', prompt: '一盏现代奶油风落地灯，米白色灯罩，细金属灯杆和圆形底座，完整家具主体，无房间背景', dimensions: [0.35, 0.35, 1.6], category: 'lighting' },
];
const requestedNames = (process.env.GENERATE_NAMES || '').split(',').map((name) => name.trim()).filter(Boolean);
const assets = catalog.filter((asset) => !requestedNames.length || requestedNames.includes(asset.name)).slice(0, approvedCount);
if (!assets.length) {
  console.error('没有匹配的待生成资产。');
  process.exit(2);
}
const base = process.env.API_BASE || 'http://127.0.0.1:4173';
const evidence = process.env.EVIDENCE_DIR || path.resolve('data', 'verification');
await fs.mkdir(evidence, { recursive: true });

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

let results = [];
try { results = JSON.parse(await fs.readFile(path.join(evidence, 'lux3d-approved-results.json'), 'utf8')); } catch {}
const completedNames = new Set(results.filter((entry) => entry.job?.status === 'succeeded').map((entry) => entry.requestedName));
for (const asset of assets) {
  if (completedNames.has(asset.name)) {
    console.log(`跳过已归档资产：${asset.name}`);
    continue;
  }
  const [width, depth, height] = asset.dimensions;
  const job = await fetchJson(`${base}/api/lux3d/text`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: asset.prompt,
      name: asset.name,
      category: asset.category,
      projectId: 'final-demo',
      dimensions: {
        width: { value: width, unit: 'm', source: 'estimated' },
        depth: { value: depth, unit: 'm', source: 'estimated' },
        height: { value: height, unit: 'm', source: 'estimated' },
      },
    }),
  });
  const started = Date.now();
  let detail;
  do {
    if (Date.now() - started > 25 * 60 * 1000) throw new Error(`${asset.name} 等待超时`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    detail = await fetchJson(`${base}/api/jobs/${job.jobId}`);
  } while (!['succeeded', 'failed', 'canceled'].includes(detail.status));
  results.push({ requestedName: asset.name, job: detail, actualCredits: 'unknown_confirm_in_aholo_console' });
  await fs.writeFile(path.join(evidence, 'lux3d-approved-results.json'), `${JSON.stringify(results, null, 2)}\n`);
  if (detail.status !== 'succeeded') throw new Error(`${asset.name} 生成失败：${detail.errorMessage || detail.status}`);
  console.log(`已生成并归档 ${asset.name}，taskId=${detail.providerTaskId}`);
}
