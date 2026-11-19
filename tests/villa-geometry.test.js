import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVillaDocument, VILLA_TEMPLATES } from '../src/data/v2-contracts.js';
import { validateSceneDocument } from '../src/data/scene-document.js';
import { createRoom } from '../src/scene/createRoom.js';
import { createDemoSceneDocument } from '../src/data/demo-scene.js';

const villa = () => createVillaDocument(VILLA_TEMPLATES[1]);

test('楼梯、楼板洞口、参考图与层高均验证数值边界，保留旧版存档', () => {
  const checks = [
    (d,f) => { f.stairs.steps=25; },
    (d,f) => { f.stairs.width='0.9'; },
    (d,f) => { f.stairs.depth=0; },
    (d,f) => { f.stairs.x=240; },
    d => {d.buildings[0].floors[1].stairOpening.width=Infinity;},
    (d,f) => {f.floorHeight=NaN;},
    (d,f) => {f.openings[0].offsetFromWallStart=NaN;},
    d => {d.referencePlan={name:'图',type:'image/jpeg',width:-1,ratio:1,blobId:'r'};},
    d => {d.referencePlans={'no-floor':{name:'图',type:'image/jpeg',width:10,ratio:1,blobId:'r'}};},
  ];
  for (const edit of checks) {
    const doc=villa(); edit(doc,doc.buildings[0].floors[0]);
    assert.equal(validateSceneDocument(doc).valid,false);
  }
  assert.equal(validateSceneDocument(villa()).valid,true);
  assert.equal(validateSceneDocument(createDemoSceneDocument()).valid,true);
});

function meshArea(mesh) {
  const geometry=mesh.geometry;
  const indices=geometry.getIndex();
  const points=geometry.getAttribute('position');
  const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3();
  let area=0;
  for(let i=0;i<indices.count;i+=3) {
    a.fromBufferAttribute(points,indices.getX(i));
    b.fromBufferAttribute(points,indices.getX(i+1));
    c.fromBufferAttribute(points,indices.getX(i+2));
    area+=b.sub(a).cross(c.sub(a)).length()/2;
  }
  return area;
}

test('三层住宅走廊的地面和天花只在对应上下行楼梯开洞；其他房间及顶层天花完整', () => {
  const doc=villa(), floors=doc.buildings[0].floors;
  floors[1].stairs.width=1.05;
  floors[2].stairOpening.width=1.05;
  for(const floor of floors) for(const room of floor.rooms) {
    const {room:group}=createRoom(new THREE.Group(),doc,room.id,{includeLights:false});
    const rect=room.boundary;
    const area=Math.abs(rect.reduce((s,p,i)=>{const n=rect[(i+1)%rect.length];return s+p.x*n.y-p.y*n.x;},0))/2;
    for(const [surface,stair] of [['floor:'+floor.id,floor.stairOpening],['ceiling:'+room.id,floor.stairs]]) {
      const expected=area-(room.roomType==='corridor' && stair ? stair.width*stair.depth : 0);
      assert(Math.abs(meshArea(group.getObjectByName(surface))-expected)<.0001,surface);
    }
    assert.equal(group.getObjectByName('legacy-living-room-props'),undefined);
  }
  const old=createDemoSceneDocument();
  const group=createRoom(new THREE.Group(),old,old.buildings[0].floors[0].rooms[0].id,{includeLights:false}).room;
  assert(group.getObjectByName('legacy-living-room-props'));
});
import { fenceSegments, gardenZone } from '../src/data/villa-site.js';
import { createBuilding } from '../src/scene/createBuilding.js';
import { walkSiteStep } from '../src/scene/walk.js';

test('前庭入口、车棚、泳池和坡屋顶使用可编辑建筑数据；高层不复制悬空入户门', () => {
  const d=villa(), building=d.buildings[0], yard=d.outdoorZones[0];
  assert.deepEqual(d.outdoorZones.map(z=>z.type),['courtyard','terrace','garage','lawn','pool']);
  for(const f of building.floors){
    const outerDoors=f.openings.filter(o=>o.type==='door' && f.walls.find(w=>w.id===o.wallId)?.structuralType==='exterior');
    assert.equal(outerDoors.length,f.levelIndex===0?1:0);
  }
  const [left,right]=fenceSegments(yard);assert.equal(Math.round((right[0]-left[2])*10)/10,yard.fence.gateWidth);
  const edited=gardenZone(yard,'terrace',4.2,3.2);
  assert(Math.abs(edited.boundary[1].x-edited.boundary[0].x-4.2)<1e-8);
  assert.throws(()=>gardenZone(yard,'garage',0,7));
  let group=createBuilding(new THREE.Group(),d).room;
  assert(group.getObjectByName('roof:'+building.id));
  assert(group.getObjectByName('outdoor:'+yard.id+'-pool').children.length>1);
  const garage=group.getObjectByName('outdoor:'+yard.id+'-garage');
  assert(garage.children.some(c=>c.userData.exteriorRoof));
  building.roof.enabled=false;group=createBuilding(new THREE.Group(),d).room;assert(!group.getObjectByName('roof:'+building.id));
  building.roof.rise=50;assert.equal(validateSceneDocument(d).valid,false);
});

test('漫游可穿入户门、穿过围栏侧通道，墙、栏杆和泳池边界阻挡行走', () => {
  const d=villa(), f=d.buildings[0].floors[0], corridor=f.rooms.find(r=>r.roomType==='corridor'), yard=d.outdoorZones[0];
  assert.equal(walkSiteStep(d,yard.id,{x:5,z:-.12},{x:5,z:.12}).roomId,corridor.id);
  assert.equal(walkSiteStep(d,corridor.id,{x:5,z:.12},{x:5,z:-.12}).roomId,yard.id);
  assert.equal(walkSiteStep(d,yard.id,{x:2,z:-.12},{x:2,z:.12}),null);
  assert.equal(walkSiteStep(d,yard.id,{x:.1,z:-1.6},{x:-.1,z:-1.6}),null);
  assert.equal(walkSiteStep(d,yard.id,{x:.1,z:-.5},{x:-.1,z:-.5}).roomId,yard.id+'-lawn');
  assert.equal(walkSiteStep(d,yard.id+'-lawn',{x:-1,z:-.1},{x:-1,z:.1}),null);
});
