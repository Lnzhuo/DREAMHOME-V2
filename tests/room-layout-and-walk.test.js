import test from 'node:test';
import assert from 'node:assert/strict';
import { createApartmentDocument, createSingleRoomDocument, createVillaDocument, FLOORPLAN_TEMPLATES, ROOM_TEMPLATES, VILLA_TEMPLATES } from '../src/data/v2-contracts.js';
import { addAdjacentRoom, moveAdjacentRoom, addWallOpening, validateRoomConnections } from '../src/ui/rooms/topology.js';
import { fitsPlacement } from '../src/data/placement-bounds.js';
import { walkStep } from '../src/scene/walk.js';

test('移动房间会保留该房间的摆放比例、重建共墙并拒绝重叠', () => {
  const doc=createSingleRoomDocument(ROOM_TEMPLATES[0]), floor=doc.buildings[0].floors[0], room=floor.rooms[0];
  const added=addAdjacentRoom(floor,room,'secondary_bedroom');
  const start={...added.boundary[0]};
  const spot={x:start.x+1,y:0,z:start.y+1};
  doc.placements.push({containerId:added.id,position:spot});
  moveAdjacentRoom(doc,floor,added,room.id,'west');
  assert.equal(spot.x-added.boundary[0].x,1);
  assert.equal(spot.z-added.boundary[0].y,1);
  assert.ok(added.boundary[0].x<room.boundary[0].x);
  assert.doesNotThrow(()=>validateRoomConnections(floor));
  const third=addAdjacentRoom(floor,room,'study');
  assert.throws(()=>moveAdjacentRoom(doc,floor,third,room.id,'west'), /占用/);
});

test('真实墙体开洞可通行，墙和窗阻挡漫游', () => {
  const doc=createApartmentDocument(FLOORPLAN_TEMPLATES[3]),building=doc.buildings[0],floor=building.floors[0];
  const wall=floor.walls.find(w=>w.roomIds.length===2 && !floor.openings.some(o=>o.wallId===w.id));
  const opening=addWallOpening(floor,wall.id,'archway');
  const norm=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
  const u=(wall.end.x-wall.start.x)/norm,v=(wall.end.y-wall.start.y)/norm;
  const crossing=offset=>{
    const x=wall.start.x+u*offset,z=wall.start.y+v*offset;
    return walkStep({building,floor,from:{x:x+.02*v,z:z-.02*u},to:{x:x-.02*v,z:z+.02*u}});
  };
  assert.ok(crossing(opening.offsetFromWallStart+opening.width.value/2));
  assert.equal(crossing(.01),null);
  opening.type='window';
  assert.equal(crossing(opening.offsetFromWallStart+opening.width.value/2),null);
});

test('漫游通过楼梯正反向切层并保持海拔连续', () => {
  const doc=createVillaDocument(VILLA_TEMPLATES[1]),building=doc.buildings[0];
  const [bottom,upper]=building.floors;
  const s=bottom.stairs,x=s.x+s.width/2;
  let from={x,z:s.z-.02},r,floor=bottom;
  for(const t of [.02,.25,.5,.75,1.01,.99,.75,.5,.25,-.01]) {
    const to={x,z:s.z+t*s.depth};
    r=walkStep({building,floor,from,to,stairFloorId:r?.stairFloorId});
    assert.ok(r);
    assert.ok(Math.abs(r.elevation-bottom.floorHeight*Math.max(0,Math.min(1,t)))<1e-6);
    floor=upper.rooms.some(room=>room.id===r.roomId)?upper:bottom;
    from=to;
  }
  assert.equal(floor.id,bottom.id);
});

test('家具脚印校验包含旋转和凹形房间边界',()=>{
  const room={boundary:[[0,0],[6,0],[6,6],[3.5,6],[3.5,2],[2.5,2],[2.5,6],[0,6]].map(([x,y])=>({x,y}))};
  const asset={dimensions:{width:{value:3},depth:{value:.4}}};
  const p={position:{x:3,z:4},scale:{x:1,z:1},rotation:{y:0}};
  assert.equal(fitsPlacement(p,asset,room),false);
  p.position={x:1.5,z:3};p.rotation.y=Math.PI/2;
  assert.equal(fitsPlacement(p,asset,room),true);
});
