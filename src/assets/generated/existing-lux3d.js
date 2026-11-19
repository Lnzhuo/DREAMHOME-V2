import { getRoomBounds } from '../../data/scene-operations.js';
import { getPrimaryRoomContext } from '../../core/api-contracts.js';

export const EXISTING_LUX3D_ASSETS = [
  {
    id: 'asset-4afeba6d-df1c-4ae6-aaac-91d8bb781133',
    name: '奶油色沙发', category: 'sofa', source: 'lux3d_text', provider: 'aholo-lux3d', providerTaskId: '8394445',
    prompt: '一件现代奶油风双人沙发，米白色布艺，圆润饱满，完整家具主体，无房间背景',
    modelUrl: '/api/assets/asset-4afeba6d-df1c-4ae6-aaac-91d8bb781133/model.glb',
    dimensions: { width: { value: 2.2, unit: 'm', source: 'estimated' }, depth: { value: 0.95, unit: 'm', source: 'estimated' }, height: { value: 0.85, unit: 'm', source: 'estimated' } },
    licenseStatus: 'user_owned', createdAt: '2026-11-19T05:39:00.887Z',
    generation: { version: 'G1', faceCount: 60000, outputFormat: ['glb'], aiPredictSize: false },
    archive: { bytes: 6998472, sha256: '6b1134fa5aab496333f3e41a99e654977ac80cab9ee2142d251713803965c418' },
  },
  {
    id: 'asset-ba751b6b-6880-417c-b4f2-e5d686580d06',
    name: '原木茶几', category: 'table', source: 'lux3d_text', provider: 'aholo-lux3d', providerTaskId: '8395285',
    prompt: '一张圆形原木茶几，浅橡木色，简洁圆润桌面和稳固桌腿，完整家具主体，无房间背景',
    modelUrl: '/api/assets/asset-ba751b6b-6880-417c-b4f2-e5d686580d06/model.glb',
    dimensions: { width: { value: 1.1, unit: 'm', source: 'estimated' }, depth: { value: 1.1, unit: 'm', source: 'estimated' }, height: { value: 0.42, unit: 'm', source: 'estimated' } },
    licenseStatus: 'user_owned', createdAt: '2026-11-19T05:48:45.485Z',
    generation: { version: 'G1', faceCount: 60000, outputFormat: ['glb'], aiPredictSize: false },
    archive: { bytes: 7406032, sha256: 'b6da1db8fc591e81208827112361b14cfbad53ea98f59be53a0549da07357078' },
  },
  {
    id: 'asset-1089f183-dc58-47f1-98bd-621d204f31aa',
    name: '落地灯', category: 'lighting', source: 'lux3d_text', provider: 'aholo-lux3d', providerTaskId: '8396095',
    prompt: '一盏现代奶油风落地灯，米白色灯罩，细金属灯杆和圆形底座，完整家具主体，无房间背景',
    modelUrl: '/api/assets/asset-1089f183-dc58-47f1-98bd-621d204f31aa/model.glb',
    dimensions: { width: { value: 0.35, unit: 'm', source: 'estimated' }, depth: { value: 0.35, unit: 'm', source: 'estimated' }, height: { value: 1.6, unit: 'm', source: 'estimated' } },
    licenseStatus: 'user_owned', createdAt: '2026-11-19T05:54:44.830Z',
    generation: { version: 'G1', faceCount: 60000, outputFormat: ['glb'], aiPredictSize: false },
    archive: { bytes: 9577024, sha256: 'f12000e2aa770b642a3a8e76b74be8c609eae2db8dfb52c20566048e6601d4a3' },
  },
];

export function withDefaultFurniture(sceneDocument) {
  const next = structuredClone(sceneDocument);
  const { room } = getPrimaryRoomContext(next);
  const bounds = getRoomBounds(room);
  const placements = [
    { id: 'placement-lux3d-sofa', assetId: EXISTING_LUX3D_ASSETS[0].id, x: bounds.minX + bounds.width * 0.42, z: bounds.minY + bounds.depth * 0.42 },
    { id: 'placement-lux3d-table', assetId: EXISTING_LUX3D_ASSETS[1].id, x: bounds.minX + bounds.width * 0.5, z: bounds.minY + bounds.depth * 0.68 },
    { id: 'placement-lux3d-lamp', assetId: EXISTING_LUX3D_ASSETS[2].id, x: bounds.minX + bounds.width * 0.78, z: bounds.minY + bounds.depth * 0.25 },
  ];
  for (const asset of EXISTING_LUX3D_ASSETS) {
    if (!next.assets.some((entry) => entry.id === asset.id)) next.assets.push(structuredClone(asset));
  }
  for (const placement of placements) {
    if (next.placements.some((entry) => entry.id === placement.id)) continue;
    next.placements.push({
      id: placement.id,
      assetId: placement.assetId,
      containerId: room.id,
      position: { x: placement.x, y: 0, z: placement.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      locked: false,
      visible: true,
    });
  }
  return next;
}
