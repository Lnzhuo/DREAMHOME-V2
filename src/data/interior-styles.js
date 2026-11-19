import { createSingleRoomDocument, ROOM_TEMPLATES } from './v2-contracts.js';
import { modelDimensions } from './placement-bounds.js';
import { createPlacement } from '../core/api-contracts.js';

export const INTERIOR_STYLES = {
  '奶油风': ['oak_wood_planks', 'white_plaster_02'],
  '现代简约': ['floor_tiles_02', 'plastered_wall'],
  '原木风': ['wooden_floor_01', 'white_plaster_rough_01'],
  '日式': ['wooden_floor_02', 'plastered_wall_04'],
  '北欧': ['old_wooden_floor_02', 'white_plaster_02'],
  '轻奢': ['marble_01', 'patterned_plaster_wall'],
  '新中式': ['dark_wooden_planks', 'plastered_wall_04'],
  '工业风': ['smooth_concrete_floor', 'grey_plaster'],
};

export function applyInteriorStyle(room, style) {
  const [floor, wall] = INTERIOR_STYLES[style];
  room.floorMaterialId = floor;
  room.wallMaterialId = wall;
  room.style = style;
  delete room.wallTint; delete room.floorTint;
}

export function createShowcase(catalog) {
  const doc = createSingleRoomDocument(ROOM_TEMPLATES.find((t) => t.roomType === 'living_room'),
    { dimensions: { width: 6.4, depth: 5.2, height: 2.8 } });
  const room = doc.buildings[0].floors[0].rooms[0];
  doc.name = '原木与奶油色 · 客厅样板间';
  applyInteriorStyle(room, '奶油风');
  room.wallMaterialId = 'default-wall';
  const floor = doc.buildings[0].floors[0];
  const door = floor.openings.find((o) => o.type === 'door');
  const window = floor.openings.find((o) => o.type === 'window');
  door.wallId = floor.walls[2].id;
  door.offsetFromWallStart = .48;
  window.wallId = floor.walls[3].id;
  window.width.value = 2.9;
  window.height.value = 1.78;
  window.sillHeight.value = .57;
  window.offsetFromWallStart = 1.05;
  const cx = (Math.min(...room.boundary.map((p) => p.x)) + Math.max(...room.boundary.map((p) => p.x))) / 2;
  const cz = (Math.min(...room.boundary.map((p) => p.y)) + Math.max(...room.boundary.map((p) => p.y))) / 2;
  const plan = [
    ['asset-4afeba6d-df1c-4ae6-aaac-91d8bb781133', -.4, -1.65, 0],
    ['asset-ba751b6b-6880-417c-b4f2-e5d686580d06', -.4, -.25, 0],
    ['asset-1089f183-dc58-47f1-98bd-621d204f31aa', -2.05, -1.65, 0],
    ['polyhaven-armchair-01', 1.4, -.12, -1.1],
    ['polyhaven-modern-wooden-cabinet', 2.48, -1.05, -Math.PI / 2],
    ['polyhaven-side-table-01', -2.05, -.5, 0],
    ['polyhaven-potted-plant-01', 1.53, -2.05, 0],
    ['polyhaven-ceramic-vase-01', -.45, -.25, 0, 'asset-ba751b6b-6880-417c-b4f2-e5d686580d06'],
    ['polyhaven-potted-plant-04', -2.05, -.5, 0, 'polyhaven-side-table-01'],
  ];
  const accents = [
    ['8426570', -.35, -.22, 0, .004],
    ['8429588', -.40, -2.50, 0, 1.23, {x:1.5,y:1.5,z:1.5}],
    ['8429319', -2.84, .10, Math.PI/2, .02, {x:1.28,y:1,z:1}],
    ['8429792', -.94, -1.65, .18, .49],
  ];
  for (const [task, ...position] of accents) {
    const asset=catalog.assets.find(a=>String(a.providerTaskId)===task);
    if(asset && !asset.scaleCalibrationRequired && asset.qa?.placementTest?.startsWith('通过') && asset.qa?.visualReview?.startsWith('已目检')) {
      plan.push([asset.id, ...position]);
    }
  }
  for (const [id, x, z, ry, surface = 0, scale = {x:1,y:1,z:1}] of plan) {
    const asset = catalog.assets.find((a) => a.id === id);
    if (!asset) continue;
    const support = typeof surface === 'string' ? doc.assets.find(a => a.id === surface) : null;
    if (typeof surface === 'string' && !support) continue;
    const y = support ? modelDimensions(support).height : surface;
    doc.assets.push(structuredClone(asset));
    doc.placements.push(createPlacement({ id: 'showcase-' + id, assetId: id, containerId: room.id,
      position: { x: cx + x, y, z: cz + z }, rotation: { x: 0, y: ry, z: 0 }, scale }));
  }
  return doc;
}
