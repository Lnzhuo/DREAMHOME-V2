import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const LIMIT = Number(process.env.POLYHAVEN_MODEL_LIMIT || 50);
const ROOT = path.resolve('data', 'library');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const priority = ['sofa', 'table', 'chair', 'bed', 'cabinet', 'shelf', 'desk', 'nightstand', 'commode', 'stool', 'bench', 'cart', 'mirror'];

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function inferCategory(id, categories) {
  const value = `${id} ${categories.join(' ')}`.toLowerCase();
  for (const keyword of priority) if (value.includes(keyword)) return keyword;
  return 'furniture';
}

async function convertAsset(entry) {
  const [sourceId, info] = entry;
  const assetId = `polyhaven-${sourceId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const directory = path.join(ROOT, 'models', assetId);
  await fs.mkdir(directory, { recursive: true });
  const modelPath = path.join(directory, 'model.glb');
  const metadataPath = path.join(directory, 'asset.json');
  if (await fs.stat(modelPath).catch(() => null) && await fs.stat(metadataPath).catch(() => null)) {
    return JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  }
  const files = await (await fetch(`https://api.polyhaven.com/files/${sourceId}`)).json();
  const gltfEntry = files.gltf?.['1k']?.gltf || files.gltf?.['2k']?.gltf;
  if (!gltfEntry?.url) throw new Error('No 1k glTF');
  const gltfUrl = gltfEntry.url;
  const include = gltfEntry.include || {};
  const gltf = JSON.parse((await download(gltfUrl)).toString('utf8'));
  const resources = [];
  for (const section of ['buffers', 'images']) {
    for (const [index, item] of (gltf[section] || []).entries()) {
      if (!item.uri || item.uri.startsWith('data:')) continue;
      const resourceUrl = include[item.uri]?.url || new URL(item.uri, gltfUrl).toString();
      const filename = `${section}-${index}${path.extname(new URL(resourceUrl).pathname) || '.bin'}`;
      const bytes = await download(resourceUrl);
      await fs.mkdir(path.join(directory, 'resources'), { recursive: true });
      await fs.writeFile(path.join(directory, 'resources', filename), bytes);
      item.uri = `resources/${filename}`;
      resources.push(filename);
    }
  }
  const localGltf = path.join(directory, 'source.gltf');
  await fs.writeFile(localGltf, JSON.stringify(gltf));
  const document = await io.read(localGltf);
  await io.write(modelPath, document);
  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
  const bounds = getBounds(scene);
  const dimension = (max, min) => ({ value: Math.max(Math.abs(max - min), 0.0001), unit: 'm', source: 'estimated' });
  const bytes = await fs.readFile(modelPath);
  const categories = info.categories || [];
  const asset = {
    id: assetId,
    name: info.name || sourceId,
    category: inferCategory(sourceId, categories),
    source: 'licensed_library',
    provider: 'polyhaven',
    sourceAssetId: sourceId,
    modelUrl: `/api/library/models/${assetId}/model.glb`,
    dimensions: {
      width: dimension(bounds.max[0], bounds.min[0]),
      depth: dimension(bounds.max[2], bounds.min[2]),
      height: dimension(bounds.max[1], bounds.min[1]),
    },
    boundingBox: bounds,
    licenseStatus: 'verified',
    createdAt: new Date().toISOString(),
    license: {
      name: 'CC0', version: '1.0', url: 'https://polyhaven.com/license',
      author: 'Poly Haven（API 未提供单独作者）', originalUrl: `https://polyhaven.com/a/${sourceId}`,
      downloadedAt: new Date().toISOString(), modifyAllowed: true, attributionRequired: false,
    },
    archive: { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), resources },
  };
  await fs.writeFile(metadataPath, `${JSON.stringify(asset, null, 2)}\n`);
  return asset;
}

const response = await fetch('https://api.polyhaven.com/assets?t=models&c=furniture');
const catalog = Object.entries(await response.json());
catalog.sort((a, b) => { const rank = e => { const n = priority.indexOf(inferCategory(e[0], e[1].categories || [])); return n < 0 ? priority.length : n; }; return rank(a) - rank(b); });
const results = [];
const failures = [];
for (const entry of catalog) {
  if (results.length >= LIMIT) break;
  try {
    const asset = await convertAsset(entry);
    results.push(asset);
    console.log(`[${results.length}/${LIMIT}] ${asset.name}`);
  } catch (error) {
    failures.push({ id: entry[0], error: error.message });
    console.warn(`跳过 ${entry[0]}：${error.message}`);
  }
}
await fs.mkdir(ROOT, { recursive: true });
await fs.writeFile(path.join(ROOT, 'polyhaven-sync.json'), `${JSON.stringify({ count: results.length, failures }, null, 2)}\n`);
const indexPath = path.join(ROOT, 'index.json');
let index = { assets: [], materials: [] }; try { index = JSON.parse(await fs.readFile(indexPath)); } catch {}
const merged = new Map(index.assets.map(a => [a.id, a])); for (const asset of results) if (!merged.has(asset.id)) merged.set(asset.id, asset); index.assets = [...merged.values()];
await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ converted: results.length, failed: failures.length }, null, 2));
