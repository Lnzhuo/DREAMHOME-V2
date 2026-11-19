import { GARDEN_SPACES, gardenZone } from './villa-site.js';
import EXTRA_ROOM_REFERENCES from '../../scripts/assets/room-references-extra.json' with { type: 'json' };
export const ROOM_SHAPES = {
  rectangle: [[0, 0], [1, 0], [1, 1], [0, 1]],
  long_rectangle: [[0, 0], [1, 0], [1, 1], [0, 1]],
  l_shape: [[0, 0], [0.62, 0], [0.62, 0.55], [1, 0.55], [1, 1], [0, 1]],
  bay_window: [[0, 0], [0.72, 0], [0.72, 0.18], [1, 0.18], [1, 1], [0, 1]],
  open_space: [[0, 0], [1, 0], [1, 1], [0, 1]],
};

export const ROOM_REFERENCES = {
  empty: { url:'/room-references/corner-windows.jpg', author:'aismallard', source:'https://commons.wikimedia.org/wiki/File:Empty_apartment_room_with_corner_windows.jpg', license:'CC BY-SA 3.0', licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/' },
  kitchen: { url:'/room-references/kitchen-cc0.jpg', author:'SmashingIt99', source:'https://commons.wikimedia.org/wiki/File:Empty_apartment_in_Berlin_with_fitted_kitchen,_chair_and_plant.jpg', license:'CC0 1.0', licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/' },
  bath: { url:'/room-references/bathroom-by4.jpg', author:'OKJaguar', source:'https://commons.wikimedia.org/wiki/File:Contemporary_bathroom.jpg', license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/' },
  bedroom: { url:'/room-references/bedroom-by4.jpg', author:'0o0ogn', source:'https://commons.wikimedia.org/wiki/File:A_Room_in_a_shared_apartment.jpg', license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/' },
  ...Object.fromEntries(EXTRA_ROOM_REFERENCES.map(reference => [reference.key, reference])),
};
const referenceFor = id => ROOM_REFERENCES[id] || ROOM_REFERENCES[id === 'bathroom' ? 'bath' : id === 'kitchen' ? 'kitchen' : ['master_bedroom','secondary_bedroom'].includes(id) ? 'bedroom' : 'empty'];

const roomType = (id, name, width, depth, styleTags = ['现代简约'], shape = 'rectangle') => ({
  id: `room-${id}`,
  name,
  roomType: id,
  defaultDimensions: { width, depth, height: 2.8, wallThickness: 0.12 },
  shape,
  styleTags,
  wallMaterialId: 'default-wall',
  floorMaterialId: 'default-floor',
  ceiling: true,
  referenceImage: referenceFor(id).url,
  reference: referenceFor(id),
  referenceImageDescription: '空间参考照片，并非该模板的实景或尺寸依据',
});

export const ROOM_TEMPLATES = [
  roomType('living_room', '客厅', 5.2, 4.8, ['奶油风', '现代简约']),
  roomType('master_bedroom', '主卧', 4.2, 4.0, ['原木风', '日式'], 'bay_window'),
  roomType('secondary_bedroom', '次卧', 3.4, 3.6, ['北欧', '现代简约']),
  roomType('dining_room', '餐厅', 3.8, 4.2, ['原木风', '轻奢'], 'open_space'),
  roomType('kitchen', '厨房', 3.2, 4.5, ['现代简约'], 'long_rectangle'),
  roomType('bathroom', '卫生间', 2.4, 2.8, ['现代简约', '微水泥']),
  roomType('study', '书房', 3.2, 3.4, ['日式', '原木风']),
  roomType('entryway', '玄关', 2.2, 2.4, ['现代简约']),
  roomType('corridor', '走廊', 1.2, 5.5, ['现代简约'], 'long_rectangle'),
  roomType('balcony', '阳台', 3.0, 1.6, ['北欧', '原木风'], 'open_space'),
  roomType('walk_in_closet', '衣帽间', 2.4, 2.6, ['现代简约'], 'l_shape'),
  roomType('storage', '储物间', 2.0, 2.2, ['现代简约']),
  roomType('laundry', '洗衣房', 2.2, 2.5, ['现代简约'], 'l_shape'),
];

export const FLOORPLAN_TEMPLATES = [
  { id: 'two-bed-one-living', name: '两室一厅一卫', width: 10, depth: 8, left: [['living_room', 0.58], ['kitchen', 0.42]], right: [['master_bedroom', 0.55], ['secondary_bedroom', 0.28], ['bathroom', 0.17]] },
  { id: 'two-bed-two-living', name: '两室两厅一卫', width: 11, depth: 8, left: [['living_room', 0.42], ['dining_room', 0.31], ['kitchen', 0.27]], right: [['master_bedroom', 0.5], ['secondary_bedroom', 0.3], ['bathroom', 0.2]] },
  { id: 'three-bed-one-living', name: '三室一厅一卫', width: 12, depth: 8.5, left: [['living_room', 0.58], ['kitchen', 0.24], ['bathroom', 0.18]], right: [['master_bedroom', 0.4], ['secondary_bedroom', 0.35], ['secondary_bedroom', 0.25]] },
  { id: 'three-bed-two-living-two-bath', name: '三室两厅两卫', width: 13, depth: 9, left: [['living_room', 0.38], ['dining_room', 0.22], ['kitchen', 0.22], ['bathroom', 0.18]], right: [['master_bedroom', 0.34], ['bathroom', 0.12], ['secondary_bedroom', 0.3], ['secondary_bedroom', 0.24]] },
  { id: 'four-bed-two-living-two-bath', name: '四室两厅两卫', width: 14, depth: 9.5, left: [['living_room', 0.46], ['dining_room', 0.28], ['kitchen', 0.26]], right: [['master_bedroom', 0.22], ['bathroom', 0.1], ['secondary_bedroom', 0.2], ['secondary_bedroom', 0.19], ['secondary_bedroom', 0.17], ['bathroom', 0.12]] },
  { id: 'compact-studio', name: '紧凑型小户型', width: 6.5, depth: 6, left: [['living_room', 0.62], ['kitchen', 0.38]], right: [['master_bedroom', 0.62], ['bathroom', 0.38]] },
  { id: 'wide-living', name: '横厅户型', width: 13, depth: 7.5, left: [['living_room', 0.5], ['dining_room', 0.27], ['kitchen', 0.23]], right: [['master_bedroom', 0.4], ['secondary_bedroom', 0.35], ['bathroom', 0.25]] },
  { id: 'north-south', name: '南北通透户型', width: 12, depth: 10, left: [['master_bedroom', 0.36], ['secondary_bedroom', 0.32], ['study', 0.32]], right: [['living_room', 0.4], ['dining_room', 0.24], ['kitchen', 0.2], ['bathroom', 0.16]] },
  {
    id:'corner-two-bed', name:'两室转角客餐厅', width:10, depth:9,
    description:'自设计示意户型，非测绘图',
    layout:[
      ['master','主卧','master_bedroom',0,0,4,3], ['bed2','次卧','secondary_bedroom',6,0,4,3],
      ['entry','玄关','entryway',4,0,2,3], ['hall','过厅','corridor',4,3,3,3],
      ['living','客厅','living_room',0,3,4,6], ['dining','餐厅','dining_room',4,6,3,3],
      ['bath','卫生间','bathroom',7,3,3,3], ['kitchen','厨房','kitchen',7,6,3,3],
    ],
    connections:[['entry','master','door'],['entry','bed2','door'],['entry','hall','archway'],['hall','living','archway'],['hall','dining','archway'],['hall','bath','door'],['living','dining','archway'],['dining','kitchen','door']],
    entrance:{room:'entry',side:'north'},
  },
  {
    id:'three-bed-double-balcony', name:'三室双阳台', width:10.5, depth:11.5,
    description:'自设计示意户型，非测绘图',
    layout:[
      ['master','主卧','master_bedroom',0,0,3.5,3.5], ['bed2','次卧','secondary_bedroom',3.5,0,3.5,3.5], ['bed3','次卧二','secondary_bedroom',7,0,3.5,3.5],
      ['hall','横向过道','corridor',0,3.5,10.5,1.2], ['living','客厅','living_room',0,4.7,4.5,3.8], ['dining','餐厅','dining_room',4.5,4.7,3,3.8],
      ['bath','卫生间','bathroom',7.5,4.7,3,1.8], ['kitchen','厨房','kitchen',7.5,6.5,3,2],
      ['balcony-south','生活阳台','balcony',0,8.5,4.5,1.5], ['balcony-north','卧室阳台','balcony',7,-1.5,3.5,1.5],
    ],
    connections:[['hall','master','door'],['hall','bed2','door'],['hall','bed3','door'],['hall','living','archway'],['hall','dining','archway'],['hall','bath','door'],['living','dining','archway'],['dining','kitchen','door'],['living','balcony-south','archway'],['bed3','balcony-north','door']],
    entrance:{room:'hall',side:'west'},
  },
];

export const BUILT_IN_MATERIALS = [
  { id: 'default-wall', name: '暖白墙面', category: 'paint', baseColor: '#eee8dc', roughness: 0.92, metalness: 0, previewColor: '#eee8dc' },
  { id: 'default-floor', name: '原木地板', category: 'wood', baseColor: '#b99a75', roughness: 0.76, metalness: 0, previewColor: '#b99a75' },
  { id: 'default-ceiling', name: '白色天花板', category: 'paint', baseColor: '#f4f2ed', roughness: 0.95, metalness: 0, previewColor: '#f4f2ed' },
];

export function validateAssetDefinition(asset) {
  const errors = [];
  for (const field of ['id', 'name', 'category', 'source', 'modelUrl']) if (!asset[field]) errors.push(`${field} required`);
  if (!asset.dimensions?.width || !asset.dimensions?.depth || !asset.dimensions?.height) errors.push('dimensions required');
  if (!asset.license && asset.source === 'licensed_library') errors.push('license required for external assets');
  return { valid: errors.length === 0, errors };
}

export function validateMaterialDefinition(material) {
  const errors = [];
  for (const field of ['id', 'name', 'category', 'baseColor']) if (!material[field]) errors.push(`${field} required`);
  if (typeof material.roughness !== 'number' || material.roughness < 0 || material.roughness > 1) errors.push('roughness must be 0..1');
  if (typeof material.metalness !== 'number' || material.metalness < 0 || material.metalness > 1) errors.push('metalness must be 0..1');
  return { valid: errors.length === 0, errors };
}

function polygonArea(points) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

function scaledBoundary(shape, width, depth, origin) {
  return ROOM_SHAPES[shape].map(([x, y]) => ({ x: origin.x + x * width, y: origin.z + y * depth }));
}

export function instantiateRoomTemplate(template, { id, floorId, origin = { x: 0, y: 0, z: 0 }, dimensions = {} }) {
  const config = { ...template.defaultDimensions, ...dimensions };
  const boundary = scaledBoundary(template.shape, config.width, config.depth, origin);
  const room = {
    id,
    floorId,
    name: template.name,
    roomType: template.roomType,
    boundary,
    ceilingHeight: { value: config.height, unit: 'm', source: 'estimated' },
    dimensionSource: 'estimated',
    floorMaterialId: template.floorMaterialId,
    wallMaterialId: template.wallMaterialId,
    templateId: template.id,
    shape: template.shape,
  };
  const walls = boundary.map((start, index) => {
    const end = boundary[(index + 1) % boundary.length];
    return {
      id: `${id}-wall-${index}`,
      floorId,
      start,
      end,
      thickness: { value: config.wallThickness, unit: 'm', source: 'estimated' },
      height: { value: config.height, unit: 'm', source: 'estimated' },
      structuralType: index === 0 ? 'exterior' : 'partition',
    };
  });
  const openings = [];
  if (template.shape === 'open_space') {
    const wall = walls[0], span = Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
    const width = Math.min(span*.72, 2.4);
    openings.push({ id:id+'-passage', wallId:wall.id, type:'archway', offsetFromWallStart:(span-width)/2,
      width:{value:width,unit:'m',source:'estimated'},height:{value:Math.min(config.height,2.2),unit:'m',source:'estimated'},sillHeight:{value:0,unit:'m',source:'estimated'} });
  }
  if (template.shape !== 'open_space') {
    const doorWall = walls[0];
    const wallLength = Math.hypot(doorWall.end.x - doorWall.start.x, doorWall.end.y - doorWall.start.y);
    const doorWidth = Math.min(0.9, wallLength * 0.45);
    openings.push({ id: `${id}-door-01`, wallId: doorWall.id, type: 'door', offsetFromWallStart: (wallLength - doorWidth) / 2, width: { value: doorWidth, unit: 'm', source: 'estimated' }, height: { value: 2.1, unit: 'm', source: 'estimated' }, sillHeight: { value: 0, unit: 'm', source: 'estimated' }, swingDirection: 'inward' });
  }
  const windowWall = walls.filter((wall) => wall.id !== walls[0].id).reduce((longest, wall) => {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    return length > longest.length ? { wall, length } : longest;
  }, { wall: walls[0], length: 0 });
  const windowWidth = Math.min(1.2, windowWall.length * 0.45);
  openings.push({ id: `${id}-window-01`, wallId: windowWall.wall.id, type: 'window', offsetFromWallStart: (windowWall.length - windowWidth) / 2, width: { value: windowWidth, unit: 'm', source: 'estimated' }, height: { value: 1.25, unit: 'm', source: 'estimated' }, sillHeight: { value: 0.9, unit: 'm', source: 'estimated' } });
  return { room, walls, openings };
}

function roomRect(id, name, type, x, y, width, depth) {
  return { id, name, roomType: type, x, y, width, depth };
}

function wallKey(start, end) {
  const points = [[start.x, start.y], [end.x, end.y]].map((point) => point.map((value) => value.toFixed(4)).join(','));
  return points.sort().join('|');
}

function layoutRooms(template, scale = 1) {
  const corridorWidth = 1.2 * scale;
  // A transverse hall gives larger family homes usable bedroom widths and a
  // short side to each bathroom. The compact and villa plans retain a longitudinal hall.
  const transverse = {
    'three-bed-two-living-two-bath': [
      [['living_room',.42],['dining_room',.22],['kitchen',.22],['bathroom',.14]],
      [['master_bedroom',.32],['secondary_bedroom',.25],['secondary_bedroom',.25],['bathroom',.18]],
    ],
    'four-bed-two-living-two-bath': [
      [['living_room',.40],['dining_room',.22],['kitchen',.22],['bathroom',.16]],
      [['master_bedroom',.25],['secondary_bedroom',.21],['secondary_bedroom',.20],['secondary_bedroom',.20],['bathroom',.14]],
    ],
    'wide-living': [
      [['living_room',.62],['dining_room',.20],['kitchen',.18]],
      [['master_bedroom',.41],['secondary_bedroom',.38],['bathroom',.21]],
    ],
  }[template.id];
  if (transverse) {
    const names = {living_room:'客厅',dining_room:'餐厅',kitchen:'厨房',bathroom:'卫生间',master_bedroom:'主卧',secondary_bedroom:'次卧'};
    const firstDepth=(template.depth-corridorWidth)*.51;
    const result=[];
    for (const [row,entries] of transverse.entries()) {
      let x=0;
      for (const [column,[type,ratio]] of entries.entries()) {
        const width=column===entries.length-1 ? template.width-x : ratio*template.width;
        result.push(roomRect(template.id+'-'+type+'-'+row+'-'+column,names[type],type,x,row?firstDepth+corridorWidth:0,width,row?template.depth-firstDepth-corridorWidth:firstDepth));
        x+=width;
      }
    }
    result.push(roomRect(template.id+'-corridor-0','走廊','corridor',0,firstDepth,template.width,corridorWidth));
    return result;
  }
  const leftWidth = (template.width - corridorWidth) / 2;
  const rightWidth = template.width - corridorWidth - leftWidth;
  const rooms = [];
  for (const [type, ratio] of template.left) {
    const index = template.left.indexOf(template.left.find((entry) => entry[0] === type && entry[1] === ratio));
    const y = template.left.slice(0, index).reduce((sum, entry) => sum + entry[1], 0) * template.depth;
    rooms.push(roomRect(`${template.id}-${type}-${index}`, type === 'living_room' ? '客厅' : type === 'kitchen' ? '厨房' : type === 'dining_room' ? '餐厅' : type === 'bathroom' ? '卫生间' : type === 'study' ? '书房' : type === 'master_bedroom' ? '主卧' : '次卧', type, 0, y, leftWidth, ratio * template.depth));
  }
  for (const [type, ratio] of template.right) {
    const index = template.right.indexOf(template.right.find((entry) => entry[0] === type && entry[1] === ratio));
    const y = template.right.slice(0, index).reduce((sum, entry) => sum + entry[1], 0) * template.depth;
    rooms.push(roomRect(`${template.id}-${type}-${index}`, type === 'living_room' ? '客厅' : type === 'kitchen' ? '厨房' : type === 'dining_room' ? '餐厅' : type === 'bathroom' ? '卫生间' : type === 'study' ? '书房' : type === 'master_bedroom' ? '主卧' : '次卧', type, leftWidth + corridorWidth, y, rightWidth, ratio * template.depth));
  }
  rooms.push(roomRect(`${template.id}-corridor-0`, '走廊', 'corridor', leftWidth, 0, corridorWidth, template.depth));
  return rooms;
}

// Split collinear edges at every junction so a corridor and its neighbours share
// exactly the same physical wall segments, even when their lengths differ.
function apartmentParts(template, scale = 1) {
  const rooms = template.layout ? template.layout.map(([tag,name,type,x,y,width,depth]) => ({...roomRect(`${template.id}-${tag}`,name,type,x*scale,y*scale,width*scale,depth*scale),tag})) : layoutRooms({ ...template, width: template.width * scale, depth: template.depth * scale }, scale);
  const edges = [];
  for (const room of rooms) {
    const { x, y, width: w, depth: d } = room;
    const points = [[x,y],[x+w,y],[x+w,y+d],[x,y+d]];
    points.forEach((a, i) => edges.push({ room, a, b: points[(i+1)%4] }));
  }
  const walls = new Map();
  const round = n => Math.round(n * 1e6) / 1e6;
  for (const edge of edges) {
    const horizontal = Math.abs(edge.a[1] - edge.b[1]) < 1e-8;
    const fixed = horizontal ? edge.a[1] : edge.a[0];
    const lo = Math.min(horizontal ? edge.a[0] : edge.a[1], horizontal ? edge.b[0] : edge.b[1]);
    const hi = Math.max(horizontal ? edge.a[0] : edge.a[1], horizontal ? edge.b[0] : edge.b[1]);
    const cuts = [lo, hi];
    for (const other of edges) {
      const oh = Math.abs(other.a[1]-other.b[1]) < 1e-8;
      if (oh !== horizontal || Math.abs((horizontal ? other.a[1] : other.a[0])-fixed)>1e-8) continue;
      for (const point of [other.a, other.b]) { const t = horizontal ? point[0] : point[1]; if (t > lo+1e-8 && t < hi-1e-8) cuts.push(t); }
    }
    const sorted = [...new Set(cuts.map(round))].sort((a,b)=>a-b);
    for (let i=0;i<sorted.length-1;i++) {
      const start = horizontal ? {x:sorted[i],y:round(fixed)} : {x:round(fixed),y:sorted[i]};
      const end = horizontal ? {x:sorted[i+1],y:round(fixed)} : {x:round(fixed),y:sorted[i+1]};
      const key = wallKey(start,end);
      if (!walls.has(key)) walls.set(key,{id:`wall-${walls.size}`,floorId:'floor-01',start,end,thickness:{value:0.12,unit:'m',source:'estimated'},height:{value:2.8,unit:'m',source:'estimated'},structuralType:'exterior',roomIds:[]});
      const wall = walls.get(key); wall.roomIds.push(edge.room.id);
    }
  }
  const list = [...walls.values()];
  const openings = [];
  if(template.layout) {
    for(const wall of list) wall.structuralType=wall.roomIds.length>1?'partition':'exterior';
    const opening = (wall,type,id,width) => {const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);openings.push({id,wallId:wall.id,type,offsetFromWallStart:(length-width)/2,width:{value:width,unit:'m',source:'estimated'},height:{value:2.1,unit:'m',source:'estimated'},sillHeight:{value:0,unit:'m',source:'estimated'},...(type==='door'?{swingDirection:'inward'}:{})});};
    for(const [from,to,type] of template.connections) {
      const first=rooms.find(r=>r.tag===from),second=rooms.find(r=>r.tag===to);
      const wall=list.filter(w=>w.roomIds.includes(first.id)&&w.roomIds.includes(second.id)).sort((a,b)=>Math.hypot(b.end.x-b.start.x,b.end.y-b.start.y)-Math.hypot(a.end.x-a.start.x,a.end.y-a.start.y))[0];
      if(!wall)throw new Error(`户型连接不存在：${from} / ${to}`);
      const len=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
      if(len<.7*scale)throw new Error(`户型连接过窄：${from} / ${to}`);
      opening(wall,type,`${template.id}-${from}-${to}`,Math.min((type==='archway'?1.6:.9)*scale,len*.75));
    }
    const entry=rooms.find(r=>r.tag===template.entrance.room), side=template.entrance.side;
    const outer=list.filter(w=>w.roomIds.length===1&&w.roomIds[0]===entry.id).filter(w=>side==='north'?Math.abs(w.start.y-entry.y)<1e-6&&Math.abs(w.end.y-entry.y)<1e-6:Math.abs(w.start.x-entry.x)<1e-6&&Math.abs(w.end.x-entry.x)<1e-6).sort((a,b)=>Math.hypot(b.end.x-b.start.x,b.end.y-b.start.y)-Math.hypot(a.end.x-a.start.x,a.end.y-a.start.y))[0];
    if(!outer)throw new Error('户型缺少外部门墙');
    opening(outer,'door',`${template.id}-front-door`,Math.min(.95*scale,Math.hypot(outer.end.x-outer.start.x,outer.end.y-outer.start.y)*.75));
    for(const wall of list) if(wall.roomIds.length===1&&wall!==outer) {
      const room=rooms.find(r=>r.id===wall.roomIds[0]),len=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
      if(['corridor','entryway'].includes(room.roomType)||len<1*scale)continue;
      const width=Math.min(1.2*scale,len*.4);
      openings.push({id:`${template.id}-${wall.id}-window`,wallId:wall.id,type:'window',offsetFromWallStart:(len-width)/2,width:{value:width,unit:'m',source:'estimated'},height:{value:1.25,unit:'m',source:'estimated'},sillHeight:{value:.9,unit:'m',source:'estimated'}});
    }
    return {rooms,walls:list,openings};
  }
  for (const wall of list) {
    const length = Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
    const connected = wall.roomIds.map(id=>rooms.find(r=>r.id===id));
    wall.structuralType = connected.length > 1 ? 'partition' : 'exterior';
    // One entrance from every room to the corridor, and windows only on the perimeter.
    const hasCorridor = connected.some(r=>r.roomType==='corridor');
    const other = connected.find(r=>r.roomType!=='corridor');
    if (hasCorridor && other && length >= 0.55) {
      const width = Math.min(0.9, length * 0.7);
      openings.push({id:`${other.id}-door`,wallId:wall.id,type:'door',offsetFromWallStart:(length-width)/2,width:{value:width,unit:'m',source:'estimated'},height:{value:2.1,unit:'m',source:'estimated'},sillHeight:{value:0,unit:'m',source:'estimated'},swingDirection:'inward'});
    } else if (connected.length === 1 && hasCorridor && length >= .8 && !openings.some(o=>o.id==='front-door')) {
      const width = Math.min(1,length-.12);
      openings.push({id:'front-door',wallId:wall.id,type:'door',offsetFromWallStart:(length-width)/2,width:{value:width,unit:'m',source:'estimated'},height:{value:2.1,unit:'m',source:'estimated'},sillHeight:{value:0,unit:'m',source:'estimated'},swingDirection:'inward'});
    } else if (connected.length === 1 && connected[0].roomType !== 'corridor' && length >= 1) {
      const width = Math.min(1.2,length*0.4);
      openings.push({id:`${wall.id}-window`,wallId:wall.id,type:'window',offsetFromWallStart:(length-width)/2,width:{value:width,unit:'m',source:'estimated'},height:{value:1.25,unit:'m',source:'estimated'},sillHeight:{value:0.9,unit:'m',source:'estimated'}});
    }
  }
  return {rooms,walls:list,openings};
}

export function createApartmentDocument(template, { projectId = `project-${template.id}`, scale = 1 } = {}) {
  const { rooms, walls, openings } = apartmentParts(template, scale);
  return {
    schemaVersion: '1.0',
    projectId,
    name: template.name,
    projectType: 'residence',
    coordinateSystem: { unit: 'm', upAxis: 'Y', forwardAxis: '+Z' },
    buildings: [{ id: 'building-01', name: template.name, origin: { x: 0, y: 0, z: 0 }, floors: [{ id: 'floor-01', buildingId: 'building-01', levelIndex: 0, elevation: 0, floorHeight: 2.8, rooms: rooms.map((room) => ({ id: room.id, floorId: 'floor-01', name: room.name, roomType: room.roomType, boundary: [{ x: room.x, y: room.y }, { x: room.x + room.width, y: room.y }, { x: room.x + room.width, y: room.y + room.depth }, { x: room.x, y: room.y + room.depth }], ceilingHeight: { value: 2.8, unit: 'm', source: 'estimated' }, dimensionSource: 'estimated', floorMaterialId: 'default-floor', wallMaterialId: 'default-wall' })), walls, openings }] }],
    outdoorZones: [],
    assets: [],
    placements: [],
    materials: BUILT_IN_MATERIALS,
    updatedAt: new Date().toISOString(),
  };
}

export const VILLA_TEMPLATES = [
  { id:'villa-two-floor', name:'两层庭院住宅', floors:2, width:10, depth:8, gardenDepth:5 },
  { id:'villa-three-floor', name:'三层庭院住宅', floors:3, width:10, depth:8, gardenDepth:5 },
];
export function createVillaDocument(template, {projectId = `project-${template.id}`} = {}) {
  const document=createApartmentDocument(FLOORPLAN_TEMPLATES[0],{projectId});
  document.name=template.name;document.projectType='villa';document.buildings[0].name=template.name;
  const base=document.buildings[0].floors[0];
  document.buildings[0].floors=Array.from({length:template.floors},(_,index)=>{
    const floor=structuredClone(base), prefix=`level-${index+1}-`, roomIds=new Map(floor.rooms.map(r=>[r.id,prefix+r.id])), wallIds=new Map(floor.walls.map(w=>[w.id,prefix+w.id]));
    floor.id=`floor-${index+1}`;floor.levelIndex=index;floor.elevation=index*2.8;floor.name=`${index+1} 层`;
    floor.rooms.forEach(r=>{r.id=roomIds.get(r.id);r.floorId=floor.id;});
    floor.walls.forEach(w=>{w.id=wallIds.get(w.id);w.floorId=floor.id;w.roomIds=w.roomIds.map(id=>roomIds.get(id));});
    if (index > 0) floor.openings = floor.openings.filter(o => o.id !== 'front-door');
    floor.openings.forEach(o=>{o.id=prefix+o.id;o.wallId=wallIds.get(o.wallId);});
    const corridor=floor.rooms.find(r=>r.roomType==='corridor');const x=Math.min(...corridor.boundary.map(p=>p.x));
    if(index<template.floors-1)floor.stairs={x:x+0.15,z:0.2,width:0.9,depth:4.2,steps:14};
    if(index>0)floor.stairOpening={x:x+0.15,z:0.2,width:0.9,depth:4.2};
    return floor;
  });
  document.outdoorZones=[{id:'courtyard-01',name:'前庭',type:'courtyard',elevation:0,boundary:[{x:0,y:-template.gardenDepth},{x:template.width,y:-template.gardenDepth},{x:template.width,y:0},{x:0,y:0}]}];
  const yard = document.outdoorZones[0];
  yard.fence = { enabled:true, height:1.05, gateWidth:2.2 };
  document.buildings[0].roof = { enabled:true, rise:1.2 };
  document.outdoorZones.push(...GARDEN_SPACES.map(spec => gardenZone(yard,spec.type)));
  return document;
}

export function createSingleRoomDocument(template, { projectId = `project-${template.id}`, dimensions = {} } = {}) {
  const { room, walls, openings } = instantiateRoomTemplate(template, { id: `${template.id}-instance`, floorId: 'floor-01', dimensions });
  return {
    schemaVersion: '1.0',
    projectId,
    name: template.name,
    projectType: 'room',
    coordinateSystem: { unit: 'm', upAxis: 'Y', forwardAxis: '+Z' },
    buildings: [{ id: 'building-01', name: template.name, origin: { x: 0, y: 0, z: 0 }, floors: [{ id: 'floor-01', buildingId: 'building-01', levelIndex: 0, elevation: 0, floorHeight: dimensions.height || template.defaultDimensions.height, rooms: [room], walls, openings }] }],
    outdoorZones: [],
    assets: [],
    placements: [],
    materials: BUILT_IN_MATERIALS,
    updatedAt: new Date().toISOString(),
  };
}

export function roomRectanglesOverlap(first, second) {
  const epsilon = 1e-8;
  return first.x < second.x + second.width - epsilon && first.x + first.width > second.x + epsilon && first.y < second.y + second.depth - epsilon && first.y + first.depth > second.y + epsilon;
}

export function validateRoomPolygon(room) {
  return room.boundary.length >= 3 && polygonArea(room.boundary.map((point) => [point.x, point.y])) > 0.001;
}
