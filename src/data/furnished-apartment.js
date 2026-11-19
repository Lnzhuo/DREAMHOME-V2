import { FLOORPLAN_TEMPLATES, createApartmentDocument } from './v2-contracts.js';
import { getRoomBounds } from './scene-operations.js';
import { fitsPlacement, modelDimensions } from './placement-bounds.js';
import { createPlacement } from '../core/api-contracts.js';

// x and z locate a model between the room's usable edges. Every row becomes
// an independent placement, including matching furniture in different rooms.
const layouts = {
  living_room: [
    ['8394445', .25,.03], ['8395285',.25,.48], ['8396095',.045,.08],
    ['8424854',.8,.48,-.6], ['polyhaven-potted-plant-01',.97,.035],
    ['polyhaven-modern-wooden-cabinet',.34,.98], ['kenney-televisionmodern',.36,.97,Math.PI,'polyhaven-modern-wooden-cabinet'],
  ],
  dining_room: [
    ['四人矩形餐桌|polyhaven-wooden-table-02',.50,.48], ['实木餐椅|polyhaven-dining-chair-02',.50,.19,Math.PI],
    ['实木餐椅|polyhaven-dining-chair-02',.50,.77], ['实木餐椅|polyhaven-dining-chair-02',.10,.48,-Math.PI/2],
    ['实木餐椅|polyhaven-dining-chair-02',.90,.48,Math.PI/2], ['polyhaven-ceramic-vase-03',.50,.48,0,'四人矩形餐桌|polyhaven-wooden-table-02'],
  ],
  master_bedroom: [
    ['8421752',.5,.94,Math.PI], ['polyhaven-side-table-01',.10,.93],
    ['polyhaven-side-table-01',.90,.93], ['polyhaven-potted-plant-02',.97,.04],
  ],
  secondary_bedroom: [
    ['8425299|8421752',.74,.9,Math.PI], ['单抽床头柜|polyhaven-painted-wooden-nightstand',.06,.92],
    ['polyhaven-painted-wooden-shelves',.06,.04],
  ],
  kitchen: [
    ['木饰面双开门冰箱|独立冷冻柜|8422657',.04,.08], ['厨房水槽柜|kenney-kitchensink',.5,.08], ['独立灶台|kenney-kitchenstove',.94,.08],
    ['壁挂油烟机|kenney-hoodmodern',.94,.07,0,1.62], ['8423657',.04,.74],
  ],
  bathroom: [['8423649',.1,.06],['8422654',.8,.45],['8423648',.13,.88]],
};

export function createFurnishedApartment(catalog) {
  const scene=createApartmentDocument(FLOORPLAN_TEMPLATES.find(t=>t.id==='three-bed-two-living-two-bath'));
  scene.name='晴木之家 · 三室两厅样板房';
  const assets=new Map(catalog.assets.flatMap(a=>[[a.id,a],[String(a.providerTaskId||a.id),a],[a.name,a]]));
  const floor=scene.buildings[0].floors[0];
  for (const room of floor.rooms) {
    const b=getRoomBounds(room);
    const placed = new Map();
    for(const [ids,x,z,yaw=0,surface=0] of layouts[room.roomType] || []) {
      const asset=ids.split('|').map(id=>assets.get(id)).find(a=>a?.thumbnailUrl && a.dimensions?.width?.value>0 && !a.scaleCalibrationRequired && !/待|需单独校准|需复核|需视觉复核|瑕疵|异常|不可拆|不可分/.test(a.qa?.visualReview || ''));
      if (!asset) continue;
      const support = typeof surface === 'string' ? placed.get(surface) : null;
      if (typeof surface === 'string' && !support) continue;
      const height = support ? support.position.y + support.height : surface;
      const {width:w,depth:d,height:renderedHeight}=modelDimensions(asset);
      const marginX=(Math.abs(Math.cos(yaw))*w+Math.abs(Math.sin(yaw))*d)/2+.1;
      const marginZ=(Math.abs(Math.sin(yaw))*w+Math.abs(Math.cos(yaw))*d)/2+.1;
      if(2*marginX>b.width || 2*marginZ>b.depth) continue;
      const position={x:b.minX+marginX+x*(b.width-2*marginX),y:height,z:b.minY+marginZ+z*(b.depth-2*marginZ)};
      const p=createPlacement({id:'home-'+room.id+'-'+scene.placements.length,assetId:asset.id,containerId:room.id,
        position,rotation:{x:0,y:yaw,z:0}});
      if(!fitsPlacement(p,asset,room)) continue;
      if(!scene.assets.some(a=>a.id===asset.id)) scene.assets.push(structuredClone(asset));
      scene.placements.push(p);
      placed.set(ids, {position, height:renderedHeight});
    }
  }
  return scene;
}
