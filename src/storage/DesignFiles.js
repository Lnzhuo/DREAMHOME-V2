import { zipSync, unzipSync, strToU8, strFromU8 } from 'three/addons/libs/fflate.module.js';
import { assertSceneDocument } from '../data/scene-document.js';
import { IDB_MODEL_PREFIX } from '../core/api-contracts.js';

const limit = 256 * 1024 * 1024;
const safeId = id => /^[a-z0-9_-]+$/i.test(id);
const serverModel = /^\/api\/assets\/asset-[\w-]+\/model\.glb$/;
const legacyModel = /^\/?assets\/models\/[\w-]+\.glb$/;
const catalogModel = /^\/api\/library\/models\/[\w-]+\/model\.glb$/;
const privateFields = /^(?:(?:aholo|lux3d|llm|openai)?(?:api)?key|accessToken|refreshToken|authorization|sessionId|cookie|password|clientSecret)$/i;
const safeJson = (key, value) => privateFields.test(key.replace(/[-_]/g, '')) ? undefined : value;

function references(doc) {
  const floors = doc.buildings.flatMap(b => b.floors);
  const refs = doc.referencePlan ? [['reference', doc.referencePlan]] : [];
  for (const [id, ref] of Object.entries(doc.referencePlans || {})) {
    if (!safeId(id) || !floors.some(f => f.id === id)) throw new Error('参考图所属楼层无效');
    refs.push(['references/' + id, ref]);
  }
  return refs;
}

function validReference(ref, bytes) {
  if (!ref || !Number.isFinite(ref.width) || ref.width < .2 || ref.width > 300 ||
      !Number.isFinite(ref.ratio) || ref.ratio <= 0 || !bytes?.length || bytes.length > 12 * 1024 * 1024) return false;
  if (ref.type === 'image/png') return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (ref.type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return ref.type === 'image/webp' && strFromU8(bytes.subarray(0,4)) === 'RIFF' && strFromU8(bytes.subarray(8,12)) === 'WEBP';
}

function validGlb(bytes) {
  if (!bytes || bytes.length < 20) return false;
  const header = new DataView(bytes.buffer, bytes.byteOffset, 20);
  if (header.getUint32(0,true) !== 0x46546c67 || header.getUint32(4,true) !== 2 ||
      header.getUint32(8,true) !== bytes.length || header.getUint32(16,true) !== 0x4e4f534a) return false;
  const jsonLength = header.getUint32(12,true);
  if (jsonLength > bytes.length - 20) return false;
  try {
    const document = JSON.parse(strFromU8(bytes.subarray(20,20 + jsonLength)));
    return [...(document.buffers || []), ...(document.images || [])].every(resource =>
      !resource.uri || /^data:(?:application|image)\/[\w.+-]+;base64,/i.test(resource.uri));
  } catch { return false; }
}

async function fetchModel(url) {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > limit) throw new Error('无法读取生成模型，请检查源项目是否仍可访问');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!validGlb(bytes)) throw new Error('源项目的模型文件无效');
  return bytes;
}

export async function buildDesignFile(doc, repo) {
  assertSceneDocument(doc);
  const bundle = { 'scene.json': strToU8(JSON.stringify(doc, safeJson)) };
  let total = bundle['scene.json'].length;
  function add(name, bytes) {
    total += bytes.length;
    if (total > limit) throw new Error('设计内容超过 256 MB，无法导出');
    bundle[name] = bytes;
  }
  for (const asset of doc.assets) {
    const url = asset.modelUrl;
    if (!url || catalogModel.test(url)) continue;
    if (!safeId(asset.id)) throw new Error('模型标识无效');
    let bytes;
    if (url.startsWith(IDB_MODEL_PREFIX)) {
      const blob = await repo.getAssetBlob(asset.id);
      if (!blob) throw new Error(asset.name + ' 的本地模型丢失');
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else if (serverModel.test(url) || legacyModel.test(url)) {
      bytes = await fetchModel(url);
    } else throw new Error('模型来源不属于此资源库');
    if (!validGlb(bytes)) throw new Error(asset.name + ' 的模型文件无效');
    add('models/' + asset.id + '.glb', bytes);
  }
  for (const [name, ref] of references(doc)) {
    const blob = await repo.getAssetBlob(ref.blobId);
    const bytes = blob && new Uint8Array(await blob.arrayBuffer());
    if (!validReference(ref, bytes)) throw new Error('参考图文件或比例无效');
    add(name, bytes);
  }
  const file = new Blob([zipSync(bundle, { level: 1 })], { type: 'application/zip' });
  if (file.size > limit) throw new Error('设计文件超过 256 MB');
  return file;
}

export async function downloadDesign(doc, repo) {
  const url = URL.createObjectURL(await buildDesignFile(doc, repo));
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.name.replace(/[\\/:*?"<>|]/g, '_') + '.dreamhome';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function readDesign(file, repo, catalog) {
  if (!file || file.size > limit) throw new Error('设计文件应小于 256 MB');
  let total = 0;
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(entry) {
    total += entry.originalSize;
    if (total > limit) throw new Error('解压后的设计过大');
    return entry.name === 'scene.json' || entry.name === 'reference' || /^references\/[\w-]+$/.test(entry.name) || /^models\/[\w-]+\.glb$/.test(entry.name);
  }});
  if (!archive['scene.json']) throw new Error('文件缺少场景文档');
  const doc = assertSceneDocument(JSON.parse(strFromU8(archive['scene.json']), safeJson));
  if (!doc.buildings[0]?.floors[0]?.rooms.length) throw new Error('设计文件缺少可编辑的首层房间');
  const local = new Map(catalog.assets.map(a => [a.id, a]));
  // The archive may reference locally installed library resources or embedded images.
  // Attribution links are only opened explicitly by the reader.
  const libraryTexture = /^\/api\/library\/materials\/[\w-]+\/[\w-]+\.(?:jpg|png|webp)$/i;
  for (const material of doc.materials || []) {
    for (const map of Object.values(material.maps || {})) {
      if (map.url && !libraryTexture.test(map.url)) throw new Error('设计引用了未归档的材质贴图');
    }
  }
  for (const asset of doc.assets) {
    if (asset.thumbnailUrl && !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(asset.thumbnailUrl) &&
        !/^\/api\/library\/models\/[\w-]+\/thumbnail\.png$/.test(asset.thumbnailUrl)) {
      throw new Error('设计引用了未归档的模型缩略图');
    }
    if (asset.planThumbnailUrl && !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(asset.planThumbnailUrl) &&
        !/^\/api\/library\/models\/[\w-]+\/plan\.png$/.test(asset.planThumbnailUrl)) {
      throw new Error('设计引用了未归档的家具平面缩略图');
    }
    for (const url of [asset.license?.originalUrl, asset.license?.url]) {
      if (url && !/^https?:\/\//i.test(url)) throw new Error('模型来源链接的格式无效');
    }
  }
  const pending = [];
  for (const asset of doc.assets) {
    if (!asset.modelUrl) continue;
    const bytes = safeId(asset.id) && archive['models/' + asset.id + '.glb'];
    if (bytes) {
      if (!validGlb(bytes)) throw new Error('设计中的模型不是有效的 GLB');
      pending.push([asset, bytes]);
    } else if (asset.modelUrl.startsWith(IDB_MODEL_PREFIX)) {
      throw new Error('文件缺少用户模型 ' + asset.name);
    } else if (local.has(asset.id)) {
      const definition = local.get(asset.id);
      asset.modelUrl = definition.modelUrl;
      if (definition.planThumbnailUrl) asset.planThumbnailUrl = definition.planThumbnailUrl;
      else if (asset.planThumbnailUrl?.startsWith('/api/library/')) delete asset.planThumbnailUrl;
    } else if (serverModel.test(asset.modelUrl) || legacyModel.test(asset.modelUrl)) {
      // Older files held a server URL only. Recover its bytes while the source is still available.
      pending.push([asset, await fetchModel(asset.modelUrl)]);
    } else throw new Error('设计引用的模型在此资源库中不存在');
  }
  const refs = references(doc);
  for (const [name, ref] of refs) if (!validReference(ref, archive[name])) throw new Error('参考图文件或比例无效');
  const created = [];
  try {
    for (const [asset, bytes] of pending) {
      const oldId = asset.id;
      asset.id = 'asset-' + crypto.randomUUID();
      created.push(asset.id);
      const blob = new Blob([bytes], { type: 'model/gltf-binary' });
      asset.modelUrl = (await repo.putAsset({ asset, blob })).modelUrl;
      for (const placement of doc.placements) if (placement.assetId === oldId) placement.assetId = asset.id;
    }
    for (const [name, ref] of refs) {
      ref.blobId = await repo.putReference(new Blob([archive[name]], { type: ref.type }));
      created.push(ref.blobId);
    }
    return doc;
  } catch (error) {
    await Promise.allSettled(created.map(id => repo.deleteAsset(id)));
    throw error;
  }
}
