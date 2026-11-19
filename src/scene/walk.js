import { getRoomBounds } from '../data/scene-operations.js';
import { fenceSegments } from '../data/villa-site.js';
// Coordinates here are floor-local x/z in metres; the document stores plan z as y.
function inside(point, polygon) {
  let hit = false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a.y>point.z)!==(b.y>point.z) && point.x<(b.x-a.x)*(point.z-a.y)/(b.y-a.y)+a.x) hit=!hit;
  }
  return hit;
}
function onStair(p, stair) {
  return stair && p.x>=stair.x && p.x<=stair.x+stair.width && p.z>=stair.z && p.z<=stair.z+stair.depth;
}
function crossesSolidWall(from, to, floor) {
  for(const wall of floor.walls) {
    const dx=wall.end.x-wall.start.x, dz=wall.end.y-wall.start.y;
    const length=Math.hypot(dx,dz);
    if(length<.001) continue;
    const signed=p=>((p.x-wall.start.x)*dz-(p.z-wall.start.y)*dx)/length;
    const before=signed(from),after=signed(to);
    if(before*after>0 || Math.abs(before-after)<1e-9) continue;
    const f=before/(before-after);
    const x=from.x+(to.x-from.x)*f, z=from.z+(to.z-from.z)*f;
    const offset=((x-wall.start.x)*dx+(z-wall.start.y)*dz)/length;
    if(offset<0 || offset>length) continue;
    const pass=floor.openings.some(o=>o.wallId===wall.id && o.type!=='window' && (o.sillHeight?.value||0)<.2 &&
      o.height.value>=1.6 && offset>=o.offsetFromWallStart+.08 && offset<=o.offsetFromWallStart+o.width.value-.08);
    if(!pass) return true;
  }
  return false;
}

export function walkStep({ building, floor, from, to, stairFloorId }) {
  if(crossesSolidWall(from,to,floor)) return null;
  const floors=building.floors;
  const below=floors.find(f=>f.levelIndex===floor.levelIndex-1);
  let ramp=floors.find(f=>f.id===stairFloorId);
  if(!ramp && floor.stairs && onStair(to,floor.stairs) && from.z<=floor.stairs.z+.12) ramp=floor;
  if(!ramp && below?.stairs && onStair(to,below.stairs) && from.z>=below.stairs.z+below.stairs.depth-.12) ramp=below;
  let destination=floor, elevation=floor.elevation;
  if(ramp) {
    const s=ramp.stairs, t=(to.z-s.z)/s.depth;
    if(to.x<s.x-.04 || to.x>s.x+s.width+.04) {
      if(t>.02 && t<.98) return null;
    }
    if(t<=0) {destination=ramp;elevation=ramp.elevation;ramp=null;}
    else if(t>=1) {
      destination=floors.find(f=>f.levelIndex===ramp.levelIndex+1) || ramp;
      elevation=destination.elevation;ramp=null;
    } else { elevation=ramp.elevation+ramp.floorHeight*t; }
  }
  const room=destination.rooms.find(r=>inside(to,r.boundary));
  if(!room) return null;
  return {roomId:room.id,elevation,stairFloorId:ramp?.id||null};
}

function crossesSiteBarrier(from,to,zones) {
  // Each panel is axis-aligned. The courtyard gate and side passages have no panel.
  const segments = zones.flatMap(zone => {
    if (zone.type!=='garage') return fenceSegments(zone);
    const b=getRoomBounds(zone);
    return [[b.minX,b.minY,b.minX,b.maxY],[b.maxX,b.minY,b.maxX,b.maxY],[b.minX,b.maxY,b.maxX,b.maxY]];
  });
  for (const [x,z,ex,ez] of segments) {
    const vertical = x === ex;
    const before = vertical ? from.x-x : from.z-z;
    const after = vertical ? to.x-x : to.z-z;
    if (before*after > 0 || Math.abs(before-after)<1e-9) continue;
    const t = before/(before-after);
    const at = vertical ? from.z+t*(to.z-from.z) : from.x+t*(to.x-from.x);
    if (at >= (vertical ? Math.min(z,ez):Math.min(x,ex)) && at <= (vertical ? Math.max(z,ez):Math.max(x,ex))) return true;
  }
  return false;
}

export function walkSiteStep(doc, containerId, from, to) {
  const zones = doc.outdoorZones;
  if (!zones.length || crossesSiteBarrier(from,to,zones)) return null;
  const sourceZone=zones.find(z=>z.id===containerId);
  const destZone=zones.find(z=>z.type!=='pool' && inside(to,z.boundary));
  if (sourceZone && destZone) return {roomId:destZone.id,elevation:destZone.elevation};
  for (const building of doc.buildings) {
    const floor=building.floors.find(f=>f.levelIndex===0);
    if (!floor) continue;
    const local = p => ({x:p.x-building.origin.x,z:p.z-building.origin.z});
    const start=local(from),end=local(to);
    if (crossesSolidWall(start,end,floor)) continue;
    if (destZone && floor.rooms.some(r=>r.id===containerId)) return {roomId:destZone.id,elevation:destZone.elevation};
    const room=sourceZone && floor.rooms.find(r=>inside(end,r.boundary));
    if (room) return {roomId:room.id,elevation:building.origin.y+floor.elevation};
  }
  return null;
}
