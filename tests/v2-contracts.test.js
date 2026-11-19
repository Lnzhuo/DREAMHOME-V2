import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOM_TEMPLATES, FLOORPLAN_TEMPLATES, BUILT_IN_MATERIALS, createApartmentDocument, instantiateRoomTemplate, roomRectanglesOverlap, validateAssetDefinition, validateMaterialDefinition, validateRoomPolygon } from '../src/data/v2-contracts.js';
import { validateSceneDocument } from '../src/data/scene-document.js';

test('V2 provides at least 12 editable room templates and 10 apartment templates', () => {
  assert.ok(ROOM_TEMPLATES.length >= 12);
  assert.ok(FLOORPLAN_TEMPLATES.length >= 10);
  assert.ok(new Set(ROOM_TEMPLATES.map((template) => template.shape)).size >= 4);
});

test('room templates instantiate valid geometry including L and bay shapes', () => {
  for (const template of ROOM_TEMPLATES) {
    const { room, walls, openings } = instantiateRoomTemplate(template, { id: `test-${template.id}`, floorId: 'floor-01' });
    assert.equal(validateRoomPolygon(room), true, template.id);
    assert.ok(walls.every((wall) => wall.thickness.value > 0));
    for(const first of openings) for(const second of openings) if(first!==second && first.wallId===second.wallId) assert.ok(first.offsetFromWallStart+first.width.value<=second.offsetFromWallStart || second.offsetFromWallStart+second.width.value<=first.offsetFromWallStart, `${template.id}: 门窗重叠`);
    for (const opening of openings) {
      const wall = walls.find((entry) => entry.id === opening.wallId);
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      assert.ok(opening.offsetFromWallStart >= 0, template.id);
      assert.ok(opening.offsetFromWallStart + opening.width.value <= length + 1e-8, `${template.id} opening exceeds wall`);
    }
  }
});

test('all apartment templates have non-overlapping rooms and unique shared walls', () => {
  for (const template of FLOORPLAN_TEMPLATES) {
    const document = createApartmentDocument(template);
    const floor = document.buildings[0].floors[0];
    for (let first = 0; first < floor.rooms.length; first += 1) {
      const a = floor.rooms[first];
      const rectA = { x: a.boundary[0].x, y: a.boundary[0].y, width: a.boundary[1].x - a.boundary[0].x, depth: a.boundary[2].y - a.boundary[1].y };
      for (let second = first + 1; second < floor.rooms.length; second += 1) {
        const b = floor.rooms[second];
        const rectB = { x: b.boundary[0].x, y: b.boundary[0].y, width: b.boundary[1].x - b.boundary[0].x, depth: b.boundary[2].y - b.boundary[1].y };
        assert.equal(roomRectanglesOverlap(rectA, rectB), false, `${template.id}: ${a.id} overlaps ${b.id}`);
      }
    }
    assert.equal(new Set(floor.walls.map((wall) => wall.id)).size, floor.walls.length);
    const coordinates = floor.walls.map((wall) => [wall.start.x, wall.start.y, wall.end.x, wall.end.y].map((value) => value.toFixed(4)).join(','));
    assert.equal(new Set(coordinates).size, coordinates.length, `${template.id}: duplicate wall geometry`);
    const result = validateSceneDocument(document);
    assert.equal(result.valid, true, `${template.id}: ${JSON.stringify(result.errors)}`);
  }
});

test('apartment scaling changes geometry but not furniture dimensions', () => {
  const template = FLOORPLAN_TEMPLATES[2];
  const normal = createApartmentDocument(template, { scale: 1 });
  const scaled = createApartmentDocument(template, { scale: 1.2 });
  const normalWidth = Math.max(...normal.buildings[0].floors[0].rooms[0].boundary.map((point) => point.x));
  const scaledWidth = Math.max(...scaled.buildings[0].floors[0].rooms[0].boundary.map((point) => point.x));
  assert.ok(Math.abs(scaledWidth - normalWidth * 1.2) < 1e-8);
  assert.equal(scaled.assets.length, 0);
});

test('archived asset and material definitions include required metadata', () => {
  const index = JSON.parse(fs.readFileSync('data/library/index.json', 'utf8'));
  assert.ok(index.assets.length >= 50);
  assert.ok(index.materials.length >= 60);
  for (const asset of index.assets) assert.equal(validateAssetDefinition(asset).valid, true, asset.id);
  for (const material of index.materials) assert.equal(validateMaterialDefinition(material).valid, true, material.id);
  for (const material of BUILT_IN_MATERIALS) assert.equal(validateMaterialDefinition(material).valid, true);
});


test('户型卧室卫浴数量、共墙和走廊门洞符合名称', () => {
  const expected = { 'two-bed-one-living':[2,1], 'two-bed-two-living':[2,1], 'three-bed-one-living':[3,1], 'three-bed-two-living-two-bath':[3,2], 'four-bed-two-living-two-bath':[4,2] };
  for (const template of FLOORPLAN_TEMPLATES) {
    const floor=createApartmentDocument(template).buildings[0].floors[0];
    if (expected[template.id]) {
      assert.equal(floor.rooms.filter(r=>r.roomType.endsWith('bedroom')).length,expected[template.id][0],template.id);
      assert.equal(floor.rooms.filter(r=>r.roomType==='bathroom').length,expected[template.id][1],template.id);
    }
    if(template.layout) continue;
    const corridor=floor.rooms.find(r=>r.roomType==='corridor');
    for(const room of floor.rooms.filter(r=>r.id!==corridor.id)) {
      const shared=floor.walls.filter(w=>w.roomIds.includes(room.id)&&w.roomIds.includes(corridor.id));
      assert.ok(shared.length,`${template.id}: ${room.name} 无共墙`);
      assert.ok(floor.openings.some(o=>o.type==='door'&&shared.some(w=>w.id===o.wallId)),`${template.id}: ${room.name} 无门`);
    }
    for (const wall of floor.walls) assert.ok(wall.roomIds.length<=2);
  }
});
import { addAdjacentRoom, deleteRoom, setRoomShape } from '../src/ui/rooms/topology.js';
test('相邻阳台添加、形状变化、删除后共墙门洞仍有效', () => {
  const doc=createApartmentDocument(FLOORPLAN_TEMPLATES[0]);const floor=doc.buildings[0].floors[0], anchor=floor.rooms[0];
  const balcony=addAdjacentRoom(floor,anchor,'balcony');
  assert.equal(balcony.roomType,'balcony');
  const shared=floor.walls.filter(w=>w.roomIds.includes(anchor.id)&&w.roomIds.includes(balcony.id));
  assert.ok(shared.length);assert.ok(floor.openings.some(o=>o.type==='door'&&shared.some(w=>w.id===o.wallId)));
  const copy=structuredClone(floor);assert.throws(()=>setRoomShape(copy,copy.rooms.find(r=>r.id===balcony.id),'l_shape'),/门洞冲突/);
  setRoomShape(floor,balcony,'rectangle');assert.equal(balcony.boundary.length,4);
  for (const opening of floor.openings) {const wall=floor.walls.find(w=>w.id===opening.wallId);assert.ok(wall);assert.ok(opening.offsetFromWallStart+opening.width.value<=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)+1e-6);}
  deleteRoom(doc,floor,balcony);assert.ok(!floor.rooms.includes(balcony));assert.equal(validateSceneDocument(doc).valid,true);
});

import { VILLA_TEMPLATES, createVillaDocument } from '../src/data/v2-contracts.js';
import { createBuilding } from '../src/scene/createBuilding.js';
import * as THREE from 'three';
test('两层和三层住宅分层、楼梯洞口、庭院可保存恢复', () => {
  for (const template of VILLA_TEMPLATES) {
    const doc=createVillaDocument(template), floor=doc.buildings[0].floors;
    assert.equal(floor.length,template.floors);assert.equal(validateSceneDocument(doc).valid,true);
    assert.ok(floor.every((f,i)=>f.elevation===i*2.8));assert.equal(doc.outdoorZones[0].type,'courtyard');
    assert.ok(floor.slice(0,-1).every((f,i)=>f.stairs && floor[i+1].stairOpening));
    const result=createBuilding(new THREE.Scene(),structuredClone(doc));
    for(const f of floor) {const node=result.room.children.find(c=>c.userData.floorId===f.id);assert.ok(node);assert.equal(node.position.y,f.elevation);assert.ok(node.children.some(c=>c.name===`room:${f.rooms[0].id}`));}
    assert.equal(validateSceneDocument(JSON.parse(JSON.stringify(doc))).valid,true);
  }
});


test('新增户型具备可通达户门、共墙、阳台与开放通道', () => {
  for(const template of FLOORPLAN_TEMPLATES.filter(t=>t.layout)) {
    const floor=createApartmentDocument(template).buildings[0].floors[0];
    assert.equal(floor.rooms.filter(r=>r.roomType.endsWith('bedroom')).length,template.id==='corner-two-bed'?2:3);
    assert.equal(floor.rooms.filter(r=>r.roomType==='balcony').length,template.id==='corner-two-bed'?0:2);
    const front=floor.openings.find(o=>o.id===`${template.id}-front-door`),frontWall=floor.walls.find(w=>w.id===front.wallId);
    assert.equal(front.type,'door');assert.equal(frontWall.roomIds.length,1);
    assert.ok(floor.openings.some(o=>o.type==='archway'));
    const visited=new Set(frontWall.roomIds),links=floor.openings.filter(o=>['door','archway'].includes(o.type)).map(o=>floor.walls.find(w=>w.id===o.wallId).roomIds);
    let previous=0;while(previous!==visited.size){previous=visited.size;for(const ids of links)if(ids.some(id=>visited.has(id))) ids.forEach(id=>visited.add(id));}
    assert.equal(visited.size,floor.rooms.length,`${template.id} 房间不可通达`);
    for(const room of floor.rooms.filter(r=>r.roomType.endsWith('bedroom'))) assert.ok(floor.openings.some(o=>o.type==='window' && floor.walls.some(w=>w.id===o.wallId && w.roomIds.length===1 && w.roomIds.includes(room.id))),`${room.name} 缺外窗`);
    assert.ok(floor.walls.every(w=>w.roomIds.length<=2));
    for(let i=0;i<floor.walls.length;i++)for(let j=i+1;j<floor.walls.length;j++){
      const a=floor.walls[i],b=floor.walls[j],horizontal=Math.abs(a.start.y-a.end.y)<1e-7, bh=Math.abs(b.start.y-b.end.y)<1e-7;
      if(horizontal!==bh||Math.abs((horizontal?a.start.y:a.start.x)-(horizontal?b.start.y:b.start.x))>1e-7)continue;
      const aa=[horizontal?a.start.x:a.start.y,horizontal?a.end.x:a.end.y].sort((x,y)=>x-y),bb=[horizontal?b.start.x:b.start.y,horizontal?b.end.x:b.end.y].sort((x,y)=>x-y);
      assert.ok(Math.min(aa[1],bb[1])-Math.max(aa[0],bb[0])<1e-6,`${template.id} 存在重复墙段`);
    }
    for(const o of floor.openings.filter(o=>o.type==='window')) assert.equal(floor.walls.find(w=>w.id===o.wallId).roomIds.length,1);
  }
});
