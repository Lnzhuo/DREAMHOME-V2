import { ROOM_SHAPES, ROOM_TEMPLATES, instantiateRoomTemplate, roomRectanglesOverlap } from '../../data/v2-contracts.js';
import { fitsPlacement } from '../../data/placement-bounds.js';
import { getRoomBounds } from '../../data/scene-operations.js';
const measure = value => ({value,unit:'m',source:'estimated'});
const key=(a,b)=>[[a.x,a.y],[b.x,b.y]].map(p=>p.map(n=>n.toFixed(5)).join(',')).sort().join('|');
const length=w=>Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y);

// Splits polygon edges at all shared endpoints and stores each segment once.
export function rebuildTopology(floor) {
  const previous=floor.walls, oldOpenings=floor.openings;
  const edges=floor.rooms.flatMap(room=>room.boundary.map((a,i)=>({room,a,b:room.boundary[(i+1)%room.boundary.length]})));
  const map=new Map();
  for(const e of edges) {
    const h=Math.abs(e.a.y-e.b.y)<1e-7;
    if(!h && Math.abs(e.a.x-e.b.x)>1e-7) throw new Error('当前只支持正交房间轮廓');
    const fixed=h?e.a.y:e.a.x, lo=Math.min(h?e.a.x:e.a.y,h?e.b.x:e.b.y),hi=Math.max(h?e.a.x:e.a.y,h?e.b.x:e.b.y);
    const cuts=[lo,hi];
    for(const o of edges) {const oh=Math.abs(o.a.y-o.b.y)<1e-7;if(h!==oh||Math.abs((h?o.a.y:o.a.x)-fixed)>1e-7)continue;for(const p of [o.a,o.b]){const n=h?p.x:p.y;if(n>lo+1e-7&&n<hi-1e-7)cuts.push(n);}}
    const sorted=[...new Set(cuts.map(n=>Math.round(n*1e6)/1e6))].sort((a,b)=>a-b);
    for(let i=0;i<sorted.length-1;i++) {const start=h?{x:sorted[i],y:fixed}:{x:fixed,y:sorted[i]},end=h?{x:sorted[i+1],y:fixed}:{x:fixed,y:sorted[i+1]},k=key(start,end);if(!map.has(k))map.set(k,{id:`wall-${crypto.randomUUID()}`,floorId:floor.id,start,end,thickness:measure(.12),height:measure(floor.floorHeight),structuralType:'exterior',roomIds:[]});map.get(k).roomIds.push(e.room.id);}
  }
  floor.walls=[...map.values()]; floor.openings=[];
  for (const wall of floor.walls) {
    wall.structuralType = wall.roomIds.length > 1 ? 'partition' : 'exterior';
    const source = previous.find(w => {
      const dx=w.end.x-w.start.x, dy=w.end.y-w.start.y, l2=dx*dx+dy*dy;
      const along=p=>(p.x-w.start.x)*dx+(p.y-w.start.y)*dy;
      return l2>0 && [wall.start,wall.end].every(p =>
        Math.abs((p.x-w.start.x)*dy-(p.y-w.start.y)*dx)<1e-6 && along(p)>=-1e-6 && along(p)<=l2+1e-6);
    });
    if (source) { wall.thickness = structuredClone(source.thickness); wall.height = structuredClone(source.height); }
  }
  // Carry over openings by their actual world position when their new segment can hold them.
  for(const opening of oldOpenings) {
    const old=previous.find(w=>w.id===opening.wallId);if(!old)continue;
    const l=length(old);if(!l)continue;const dx=(old.end.x-old.start.x)/l,dy=(old.end.y-old.start.y)/l;
    const p={x:old.start.x+dx*(opening.offsetFromWallStart+opening.width.value/2),y:old.start.y+dy*(opening.offsetFromWallStart+opening.width.value/2)};
    const wall=floor.walls.find(w=>{const n=length(w), ux=(w.end.x-w.start.x)/n,uy=(w.end.y-w.start.y)/n,t=(p.x-w.start.x)*ux+(p.y-w.start.y)*uy;return Math.abs((p.x-w.start.x)*uy-(p.y-w.start.y)*ux)<1e-5&&t>=opening.width.value/2&&t<=n-opening.width.value/2&&(opening.type!=='window'||w.roomIds.length===1);});
    if(wall){const n=length(wall),t=((p.x-wall.start.x)*(wall.end.x-wall.start.x)+(p.y-wall.start.y)*(wall.end.y-wall.start.y))/n;floor.openings.push({...opening,wallId:wall.id,offsetFromWallStart:t-opening.width.value/2});}
  }
  // Ensure every adjacent pair has a traversable connection, without opening tiny fragments.
  const pairs=new Set();
  for(const wall of floor.walls.filter(w=>w.roomIds.length===2).sort((a,b)=>length(b)-length(a))) {
    const pair=[...wall.roomIds].sort().join('|');if(pairs.has(pair))continue;
    if(floor.openings.some(o=>o.type!=='window' && floor.walls.some(w=>w.id===o.wallId && w.roomIds.length===2 && [...w.roomIds].sort().join('|')===pair))) {pairs.add(pair);continue;}
    if(length(wall)<0.65)continue; const width=Math.min(.9,length(wall)*.65);
    floor.openings.push({id:`opening-${crypto.randomUUID()}`,wallId:wall.id,type:'door',offsetFromWallStart:(length(wall)-width)/2,width:measure(width),height:measure(2.1),sillHeight:measure(0),swingDirection:'inward'});pairs.add(pair);
  }
}
export function setRoomShape(floor,room,shape) {
  if(!ROOM_SHAPES[shape])throw new Error('未知房间形状');
  const previousDoors=floor.openings.filter(o=>o.type==='door' && floor.walls.some(w=>w.id===o.wallId && w.roomIds?.includes(room.id))).map(o=>o.id);
  const b=getRoomBounds(room);room.boundary=ROOM_SHAPES[shape].map(([x,y])=>({x:b.minX+x*b.width,y:b.minY+y*b.depth}));room.shape=shape;rebuildTopology(floor);
  if(previousDoors.some(id=>!floor.openings.some(o=>o.id===id)))throw new Error('新形状与现有门洞冲突，请先调整门的位置');
  if (shape === 'open_space') {
    const owned = floor.walls.filter(w=>w.roomIds.includes(room.id));
    const wall = owned.filter(w=>w.roomIds.length > 1).sort((a,b)=>length(b)-length(a))[0] || owned.sort((a,b)=>length(b)-length(a))[0];
    const opening = floor.openings.find(o=>o.wallId===wall.id && o.type!=='window');
    if (opening) opening.type = 'archway';
    else addWallOpening(floor, wall.id, 'archway');
  }
  validateOpenings(floor);
}

export function addWallOpening(floor, wallId, type) {
  const wall = floor.walls.find(w=>w.id===wallId);
  if (!wall || !['door','window','archway'].includes(type)) throw new Error('请选择墙体和开口类型');
  const occupied = floor.openings.filter(o=>o.wallId===wallId).sort((a,b)=>a.offsetFromWallStart-b.offsetFromWallStart);
  let cursor = 0;
  const gaps = [];
  for (const slot of occupied) {
    gaps.push([cursor, slot.offsetFromWallStart]);
    cursor = Math.max(cursor, slot.offsetFromWallStart+slot.width.value);
  }
  gaps.push([cursor,length(wall)]);
  const [a,b] = gaps.sort((x,y)=>(y[1]-y[0])-(x[1]-x[0]))[0];
  const width = Math.min(type==='archway'?2.2:type==='door'?.9:1.2, b-a-.14);
  if (width < (type==='window'?.3:.55)) throw new Error('这段墙没有足够的空位，可选择另一面墙或调整已有门窗');
  const sill = type==='window' ? Math.min(.85, wall.height.value/3) : 0;
  const opening = { id:'opening-'+crypto.randomUUID(), wallId, type, offsetFromWallStart:(a+b-width)/2, width:measure(width),
    height:measure(Math.min(wall.height.value-sill, type==='window'?1.25:2.1)), sillHeight:measure(sill) };
  if (type==='door') opening.swingDirection='inward';
  floor.openings.push(opening);
  validateOpenings(floor);
  return opening;
}

export function validateRoomConnections(floor) {
  const reachable = new Set([floor.rooms[0].id]);
  let last = 0;
  while (last !== reachable.size) {
    last = reachable.size;
    for (const wall of floor.walls) {
      if (!wall.roomIds?.some(id=>reachable.has(id)) || !floor.openings.some(o=>o.wallId===wall.id && o.type!=='window')) continue;
      wall.roomIds.forEach(id=>reachable.add(id));
    }
  }
  if (reachable.size !== floor.rooms.length) throw new Error('这项修改会断开房间之间的通道');
}

export function moveAdjacentRoom(doc, floor, room, anchorId, side) {
  const anchor = floor.rooms.find(r=>r.id===anchorId);
  if (!anchor || room.id===anchorId || !['east','west','north','south'].includes(side)) throw new Error('请选择其他房间和方位');
  if (room.roomType==='corridor' && (floor.stairs || floor.stairOpening)) throw new Error('楼梯走廊需要保持上下层对齐');
  const src=getRoomBounds(room), dst=getRoomBounds(anchor);
  const x=side==='east'?dst.maxX:side==='west'?dst.minX-src.width:dst.minX;
  const y=side==='south'?dst.maxY:side==='north'?dst.minY-src.depth:dst.minY;
  if (floor.rooms.some(r=>{
    const b=getRoomBounds(r);
    return r.id!==room.id && roomRectanglesOverlap({x,y,width:src.width,depth:src.depth},{x:b.minX,y:b.minY,width:b.width,depth:b.depth});
  })) throw new Error('这个位置已被其他房间占用，可以选择另一侧');
  const dx=x-src.minX, dy=y-src.minY;
  const translate=p=>({x:p.x+dx,y:p.y+dy});
  room.boundary = room.boundary.map(translate);
  for (const wall of floor.walls.filter(w=>w.roomIds?.length===1 && w.roomIds[0]===room.id)) {
    wall.start=translate(wall.start); wall.end=translate(wall.end);
  }
  for (const placement of doc.placements.filter(p=>p.containerId===room.id)) { placement.position.x+=dx; placement.position.z+=dy; }
  rebuildTopology(floor);
  validateOpenings(floor); validateRoomConnections(floor); validateFurniture(doc,floor);
}
export function addAdjacentRoom(floor,anchor,type) {
  const template=ROOM_TEMPLATES.find(t=>t.roomType===type);if(!template)throw new Error('未知房间类型');
  const b=getRoomBounds(anchor), w=template.defaultDimensions.width,d=template.defaultDimensions.depth;
  const candidates=[{x:b.maxX,y:b.minY},{x:b.minX-w,y:b.minY},{x:b.minX,y:b.maxY},{x:b.minX,y:b.minY-d}];
  const rects=floor.rooms.map(r=>{const x=getRoomBounds(r);return {x:x.minX,y:x.minY,width:x.width,depth:x.depth};});
  const spot=candidates.find(c=>!rects.some(r=>roomRectanglesOverlap({...c,width:w,depth:d},r)));
  if(!spot)throw new Error('当前房间四周没有足够空间，请选择边缘房间');
  const id=`room-${crypto.randomUUID()}`;const result=instantiateRoomTemplate(template,{id,floorId:floor.id,origin:{x:spot.x,z:spot.y},dimensions:{height:floor.floorHeight}});
  // Starting as a rectangle guarantees a shared boundary; change shape afterwards.
  result.room.boundary=[{x:spot.x,y:spot.y},{x:spot.x+w,y:spot.y},{x:spot.x+w,y:spot.y+d},{x:spot.x,y:spot.y+d}];result.room.shape='rectangle';floor.rooms.push(result.room);rebuildTopology(floor);const outside=floor.walls.filter(w=>w.roomIds.length===1&&w.roomIds[0]===id).sort((a,b)=>length(b)-length(a))[0];if(outside&&length(outside)>1){const width=Math.min(1.2,length(outside)*.4);floor.openings.push({id:`opening-${crypto.randomUUID()}`,wallId:outside.id,type:'window',offsetFromWallStart:(length(outside)-width)/2,width:measure(width),height:measure(1.25),sillHeight:measure(.9)});}return result.room;
}
export function deleteRoom(document,floor,room) {
  if(floor.rooms.length===1)throw new Error('至少保留一个房间');
  floor.rooms=floor.rooms.filter(r=>r.id!==room.id);document.placements=document.placements.filter(p=>p.containerId!==room.id);rebuildTopology(floor);validateRoomConnections(floor);
}

export function validateOpenings(floor) {
  for(const wall of floor.walls) {
    const items=floor.openings.filter(o=>o.wallId===wall.id).sort((a,b)=>a.offsetFromWallStart-b.offsetFromWallStart);
    for(let i=0;i<items.length;i++) {
      const o=items[i]; if(o.offsetFromWallStart < -1e-7 || o.offsetFromWallStart+o.width.value > length(wall)+1e-7 || o.sillHeight.value+o.height.value>wall.height.value+1e-7) throw new Error('门窗超出墙体，请调整尺寸');
      if(i && items[i-1].offsetFromWallStart+items[i-1].width.value > o.offsetFromWallStart+1e-7) throw new Error('门窗相互重叠，请调整位置');
    }
  }
}
export function validateFurniture(doc,floor) {
  for(const placement of doc.placements.filter(p=>floor.rooms.some(r=>r.id===p.containerId))) {
    const room=floor.rooms.find(r=>r.id===placement.containerId), asset=doc.assets.find(a=>a.id===placement.assetId);
    if(!asset)continue;
    if(!fitsPlacement(placement, asset, room))throw new Error(`家具“${asset.name}”将超出房间，请先调整家具位置或空间尺寸`);
  }
}
