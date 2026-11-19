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

const catalog = await (await fetch('https://api.polyhaven.com/assets?t=models')).json();
const ids = ['GothicBed_01','old_bed_frame','vintage_day_bed'];
const indexPath=path.join(ROOT,'index.json');const index=JSON.parse(await fs.readFile(indexPath));
for(const id of ids) {try {const a=await convertAsset([id,catalog[id]]);a.name=({'GothicBed_01':'古典床','old_bed_frame':'复古床架','vintage_day_bed':'复古日式榻床'})[id];a.category='床';a.tags=['卧室','床',id];index.assets=index.assets.filter(x=>x.id!==a.id);index.assets.push(a);await fs.writeFile(path.join(ROOT,'models',a.id,'asset.json'),JSON.stringify(a,null,2)+'\n');console.log('bed',a.id)} catch(e){console.error(id,e.message)}}
await fs.writeFile(indexPath,JSON.stringify(index,null,2)+'\n');
