/**
 * 用 Aholo Lux3D 把 assets/source/<id>.jpg|png 生成 3D 模型（GLB）。
 *
 * 用法：
 *   1. 在 https://labs.aholo3d.cn/api-keys 创建 API Key，写入项目根目录 .env：
 *        AHOLO_API_KEY=你的key
 *   2. 把物品照片放进 assets/source/，文件名与物品 id 一致：
 *        mug.jpg / lamp.jpg / book.jpg / plant.jpg / plush.jpg / sneaker.jpg
 *   3. npm run generate            # 生成全部已有照片的物品
 *      npm run generate -- mug lamp  # 只生成指定物品
 *
 * 产物：
 *   public/assets/models/<id>.glb      页面会自动加载替换占位模型
 *   public/assets/models/manifest.json 模型清单
 *   public/assets/photos/<id>.<ext>    原始照片，用于记忆卡片「照片 → 3D」对照
 *
 * 说明：Lux3D 为异步任务，单个物品通常需要数分钟；脚本串行处理以避开并发限制。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLux3dClient } from '@manycore/aholo-sdk-lux3d';
import { OBJECTS } from '../src/data/objects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'assets', 'source');
const MODEL_DIR = path.join(ROOT, 'public', 'assets', 'models');
const PHOTO_DIR = path.join(ROOT, 'public', 'assets', 'photos');
const API_BASE = process.env.AHOLO_API_BASE || 'https://api.aholo.cn';
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

async function loadEnv() {
  try {
    const content = await fs.readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // 没有 .env 时直接读环境变量
  }
}

async function findSource(id) {
  for (const ext of IMAGE_EXTENSIONS) {
    const file = path.join(SOURCE_DIR, `${id}${ext}`);
    try {
      await fs.access(file);
      return file;
    } catch {
      // 尝试下一个扩展名
    }
  }
  return null;
}

async function pollTask(taskId, apiKey) {
  const startedAt = Date.now();
  for (;;) {
    const res = await fetch(`${API_BASE}/lux3d/v1/generate/task/get?taskid=${taskId}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) throw new Error(`查询任务失败 HTTP ${res.status}`);
    const body = await res.json();
    if (body.c !== '0') throw new Error(`查询任务失败：${body.m || body.c}`);
    const status = body.d?.status;
    if (status === 3) return body.d;
    if (status === 4 || status === 6) {
      throw new Error(`生成失败（status=${status}）：${JSON.stringify(body.d?.outputs || [])}`);
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('生成超时（20 分钟），可到 Lux3D 工作台查看任务后重试');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function pickGlbUrl(outputs = []) {
  const urls = outputs
    .map((item) => item?.content)
    .filter((content) => typeof content === 'string' && /^https?:\/\//.test(content));
  return urls.find((url) => /\.glb(\?|$)/i.test(url)) || urls.at(-1) || null;
}

async function main() {
  await loadEnv();
  const apiKey = process.env.AHOLO_API_KEY;
  if (!apiKey) {
    console.error('缺少 AHOLO_API_KEY。请先在 .env 中配置（参考 .env.example）。');
    process.exit(1);
  }

  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const candidates = requested.length ? requested : OBJECTS.map((item) => item.id);
  const lux3d = createLux3dClient({ region: 'cn', apiKey });

  await fs.mkdir(MODEL_DIR, { recursive: true });
  await fs.mkdir(PHOTO_DIR, { recursive: true });

  const manifestPath = path.join(MODEL_DIR, 'manifest.json');
  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    manifest = {};
  }

  const results = [];
  for (const id of candidates) {
    const source = await findSource(id);
    if (!source) {
      console.log(`\n[跳过] ${id}：未找到 assets/source/${id}.jpg（或 .png/.webp）`);
      results.push({ id, status: 'skipped' });
      continue;
    }

    console.log(`\n[生成] ${id} ← ${path.relative(ROOT, source)}`);
    try {
      const taskId = await lux3d.imgTo3d.createFromFile(source, {
        version: 'G1',
        faceCount: 60_000,
        outputFormat: ['zip', 'glb'],
      });
      console.log(`  任务已创建 taskId=${taskId}，等待生成（通常几分钟）…`);

      const detail = await pollTask(String(taskId), apiKey);
      const glbUrl = pickGlbUrl(detail.outputs);
      if (!glbUrl) throw new Error(`未在结果中找到 GLB 地址：${JSON.stringify(detail.outputs)}`);

      const modelPath = path.join(MODEL_DIR, `${id}.glb`);
      const download = await fetch(glbUrl);
      if (!download.ok) throw new Error(`下载 GLB 失败 HTTP ${download.status}`);
      await fs.writeFile(modelPath, Buffer.from(await download.arrayBuffer()));
      manifest[id] = `${id}.glb`;
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await fs.copyFile(source, path.join(PHOTO_DIR, path.basename(source)));
      console.log(`  完成：public/assets/models/${id}.glb`);
      results.push({ id, status: 'done' });
    } catch (error) {
      console.error(`  失败：${error.message}`);
      results.push({ id, status: 'failed', error: error.message });
    }
  }

  console.log('\n生成结果：');
  results.forEach((item) => console.log(`  ${item.id}: ${item.status}`));
  console.log('\n启动 npm run dev，生成的模型会自动替换对应占位模型。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
