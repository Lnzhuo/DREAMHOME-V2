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
const entries = [
['vintage_microwave','复古微波炉','家电'],['desk_lamp_arm_01','可调臂台灯','灯具'],['caged_hanging_light','笼罩吊灯','灯具'],['hanging_industrial_lamp','工业风吊灯','灯具'],['industrial_pipe_lamp','工业管道台灯','灯具'],['industrial_wall_lamp','工业风壁灯','灯具'],['modern_ceiling_lamp_01','现代吸顶灯','灯具'],['vintage_oil_lamp','复古油灯','灯具'],
['GothicCabinet_01','哥特式柜','柜架'],['Shelf_01','木质置物架','柜架'],['WoodenChair_01','木餐椅','椅凳'],['bar_chair_round_01','圆座吧椅','椅凳'],['chinese_armchair','中式扶手椅','椅凳'],['chinese_cabinet','中式储物柜','柜架'],['chinese_stool','中式方凳','椅凳'],['dining_chair_02','餐椅','椅凳'],['drawer_cabinet','抽屉柜','柜架'],['folding_wooden_stool','折叠木凳','椅凳'],['gallinera_chair','古典木椅','椅凳'],['metal_stool_01','金属凳一','椅凳'],['metal_stool_02','金属凳二','椅凳'],['metal_stool_03','金属凳三','椅凳'],['mid_century_lounge_chair','中古休闲椅','椅凳'],['modern_arm_chair_01','现代扶手椅','椅凳'],['painted_wooden_cabinet','漆面木柜','柜架'],['painted_wooden_cabinet_02','漆面储物柜','柜架'],['painted_wooden_chair_01','漆面木椅一','椅凳'],['painted_wooden_chair_02','漆面木椅二','椅凳'],['painted_wooden_stool','漆面木凳','椅凳'],['plastic_monobloc_chair_01','塑料一体椅','椅凳'],['vintage_cabinet_01','复古木柜','柜架'],['wooden_bookshelf_worn','旧式书架','柜架'],['wooden_stool_01','木凳一','椅凳'],['wooden_stool_02','木凳二','椅凳'],
['ornate_mirror_01','雕饰穿衣镜','软装'],['antique_ceramic_vase_01','古典陶瓷花瓶','软装'],['ceramic_vase_01','陶瓷花瓶一','软装'],['ceramic_vase_02','陶瓷花瓶二','软装'],['ceramic_vase_03','陶瓷花瓶三','软装'],['ceramic_vase_04','陶瓷花瓶四','软装'],['potted_plant_01','盆栽绿植一','软装'],['potted_plant_02','盆栽绿植二','软装'],['potted_plant_04','盆栽绿植三','软装'],['planter_box_01','长方花槽','软装'],['planter_pot_clay','陶土花盆','软装']];
const indexPath=path.join(ROOT,'index.json');const index=JSON.parse(await fs.readFile(indexPath));
for(const [id,name,category] of entries) {try {const a=await convertAsset([id,catalog[id]]);a.name=name;a.category=category;a.tags=[name,category,id];a.license.author=Object.keys(catalog[id]?.authors||{}).join(', ')||'Poly Haven';index.assets=index.assets.filter(x=>x.id!==a.id);index.assets.push(a);await fs.writeFile(path.join(ROOT,'models',a.id,'asset.json'),JSON.stringify(a,null,2)+'\n');await fs.writeFile(indexPath,JSON.stringify(index,null,2)+'\n');console.log('added',a.id)} catch(e){console.error(id,e.message)}}
