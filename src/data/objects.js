import { createDemoSceneDocument } from './demo-scene.js';
import { assertSceneDocument } from './scene-document.js';

export function getAssetSize(asset) {
  const dimensions = Object.values(asset.dimensions)
    .map((dimension) => dimension.value)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!dimensions.length) throw new Error(`Asset ${asset.id} needs a known dimension before rendering`);
  return Math.max(...dimensions);
}

export function deriveObjectViews(sceneDocument) {
  return sceneDocument.placements.map((placement) => {
    const asset = sceneDocument.assets.find((entry) => entry.id === placement.assetId);
    if (!asset) throw new Error(`Placement ${placement.id} references missing asset ${placement.assetId}`);
    return {
      id: asset.id,
      placementId: placement.id,
      name: asset.name,
      clue: asset.narrative?.clue || '',
      story: asset.narrative?.story || '',
      position: [placement.position.x, placement.position.y, placement.position.z],
      rotationY: placement.rotation.y,
      size: getAssetSize(asset),
      placeholder: asset.procedural?.kind,
      color: asset.procedural?.color,
      hasModel: false,
      asset,
      placement,
    };
  });
}

export function applyLegacyManifest(sceneDocument, manifest = {}) {
  const next = structuredClone(sceneDocument);
  for (const asset of next.assets) {
    const file = manifest[asset.id];
    if (asset.source !== 'procedural' || typeof file !== 'string' || !/^[a-z0-9_-]+\.glb$/i.test(file)) continue;
    asset.source = 'user_upload';
    asset.modelUrl = `assets/models/${file}`;
    asset.provenanceStatus = 'legacy_manifest_unverified';
  }
  return assertSceneDocument(next);
}

// Compatibility for the generation script; all scene fields originate in SceneDocument.
export const OBJECTS = deriveObjectViews(createDemoSceneDocument());

export const PROJECT = {
  title: '记忆寻物局',
  subtitle: '把身边的旧物，变成可以走进去的 3D 记忆房间',
  intro:
    '拍一张物品照片，用 Aholo Lux3D 生成可编辑的 3D 资产，再把它们放回房间。循着线索找到 6 件旧物，读完它们替你保存的那些小事。',
  credit: '3D 资产：Aholo Lux3D 图生 3D ｜ 场景与交互：Three.js',
};
