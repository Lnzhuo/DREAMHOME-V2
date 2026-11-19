import * as THREE from 'three';
import { loadGlb } from '../scene/loadModel.js';
import { renderThumbnailDataUrl, renderPlanDataUrl } from './thumbnailer.js';
import { IDB_MODEL_PREFIX } from '../core/api-contracts.js';

export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

export function estimatedDimensions(width, depth, height) {
  return {
    width: { value: Number(width), unit: 'm', source: 'estimated' },
    depth: { value: Number(depth), unit: 'm', source: 'estimated' },
    height: { value: Number(height), unit: 'm', source: 'estimated' },
  };
}

export async function inspectGlb(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const model = await loadGlb(url);
    const size = new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3());
    return estimatedDimensions(size.x || 1, size.z || 1, size.y || 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createUploadedGlbAsset(file) {
  const id = `asset-${crypto.randomUUID()}`;
  const objectUrl = URL.createObjectURL(file);
  let thumbnailUrl, plan;
  try { thumbnailUrl = await renderThumbnailDataUrl(objectUrl); plan = await renderPlanDataUrl(objectUrl); } finally { URL.revokeObjectURL(objectUrl); }
  return {
    id, thumbnailUrl, planThumbnailUrl: plan.url, planThumbnail: { width: plan.width, height: plan.height, view: plan.view, up: plan.up, right: plan.right, projection: plan.projection },
    name: file.name.replace(/\.glb$/i, ''),
    category: 'furniture',
    source: 'user_upload',
    modelUrl: `${IDB_MODEL_PREFIX}${id}/model.glb`,
    dimensions: await inspectGlb(file),
    licenseStatus: 'user_owned',
    createdAt: new Date().toISOString(),
  };
}

export function assetSourceLabel(asset) {
  if (asset.source === 'licensed_library') return `CC0 · ${asset.provider === 'kenney' ? 'Kenney（低多边形）' : 'Poly Haven'}`;
  return {
    lux3d_image: 'Lux3D 图生 3D',
    lux3d_text: 'Lux3D 文生 3D',
    user_upload: '用户上传',
    licensed_library: 'CC0 · Poly Haven',
    procedural: '程序化开发模型',
  }[asset.source] || '来源未知';
}
