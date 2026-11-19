import test from 'node:test';
import assert from 'node:assert/strict';
import { localBrief,validBrief,SPACES } from '../src/data/room-brief.js';
import { STYLE_PRESETS, openStylePreset } from '../src/data/style-presets.js';
import { createDesignedRoom } from '../src/data/designed-room.js';
import { validateSceneDocument } from '../src/data/scene-document.js';
import { fitsPlacement } from '../src/data/placement-bounds.js';

const mock=(id,width,height,depth)=>({
  id,name:id,category:'furniture',modelUrl:'/assets/models/'+id+'.glb',source:'user_upload',
  licenseStatus:'user_owned',createdAt:'2026-11-19T00:00:00Z',
  dimensions:Object.fromEntries(Object.entries({width,height,depth}).map(([k,value])=>[k,{value,unit:'m',source:'estimated'}])),
});
const models=[mock('8394445',2.2,.9,1.1),mock('8395285',1.1,.58,1.1),mock('8421752',2.1,1.38,1.88),
  mock('8426212',1.25,.75,.42),mock('8425729',1.4,.71,.84),mock('8437864',.54,.85,.52),mock('8426570',1.8,.06,2.38)];

test('本地搭配尊重尺寸、色系和明确排除的软装',()=>{
  const b=localBrief('鼠尾草绿色卧室 4米乘3.5米，不要地毯，不需要绿植，要收纳');
  assert.equal(b.space,'master_bedroom');assert.equal(b.palette,'moss');
  assert.deepEqual([b.width,b.depth],[4,3.5]);
  assert.ok(b.details.includes('storage') && !b.details.includes('plants') && !b.details.includes('rug'));
  assert.throws(()=>localBrief('厨房 20 平米'));
  assert.throws(()=>localBrief('卧室 2x2'));
  assert.equal(validBrief({...b,palette:'toString'}),false);
  assert.equal(validBrief({...b,width:NaN}),false);
});
test('四类单间在紧凑与宽敞尺寸下可校验、保存并恢复，所有实例落在房内',()=>{
  for(const space of Object.keys(SPACES)) for(const size of [3.2,5.8,9]) {
    const brief={...localBrief('原木色，有挂画'),space,width:size,depth:size};
    const {document:doc}=createDesignedRoom(brief,models);
    const restored=JSON.parse(JSON.stringify(doc)),room=restored.buildings[0].floors[0].rooms[0];
    assert.equal(validateSceneDocument(restored).valid,true);
    assert.ok(restored.placements.length>=2);
    for(const p of restored.placements) assert.ok(fitsPlacement(p,restored.assets.find(a=>a.id===p.assetId),room));
  }
});
test('缺少主家具时给出错误，无法放置的次要物品进入方案摘要',()=>{
  const b=localBrief('客厅');
  assert.throws(()=>createDesignedRoom(b,[]),/沙发/);
  const result=createDesignedRoom(b,[models[0]]);
  assert.ok(result.omitted.includes('茶几'));
  assert.ok(!result.document.placements.some(p=>p.assetId==='studio-books'));
});


test('成套预设每次打开独立副本，桌面物件随家具实际高度落位',()=>{
  const preset=STYLE_PRESETS.find(p=>p.id==='terracotta');
  const catalog=[...new Set(preset.items.map(([,id])=>id))].map(id=>mock(id,.25,.40,.18));
  const a=openStylePreset(preset.id,catalog),b=openStylePreset(preset.id,catalog);
  const byId=new Map(a.placements.map(p=>[p.id,p]));
  assert.equal(validateSceneDocument(a).valid,true);
  assert.equal(byId.get('terracotta-lamp').position.y,.40);
  byId.get('terracotta-bed').position.x=0;
  assert.notEqual(b.placements.find(p=>p.id==='terracotta-bed').position.x,0);
  assert.throws(()=>openStylePreset(preset.id,catalog.filter(a=>a.id!=='8433400')),/模型库/);
});
