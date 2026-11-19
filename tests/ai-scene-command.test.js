import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSceneDocument } from '../src/data/demo-scene.js';
import { SceneCommandExecutor, validateSceneCommandPlan } from '../src/ai/scene-command.js';
import { generateSceneCommand } from '../server/ai/handler.js';

class MockEditor {
  constructor() { this.sceneDocument = createDemoSceneDocument(); this.calls = []; this.past = []; }
  getSceneDocument() { return this.sceneDocument; }
  runWithHistory(callback) { this.past.push(structuredClone(this.sceneDocument)); return callback(); }
  addAsset(asset, options) { this.calls.push(['add', asset.id, options]); }
  updatePlacementTransform(id, transform) { this.calls.push(['transform', id, transform]); const p=this.sceneDocument.placements.find(p=>p.id===id); for(const key of ['position','rotation','scale']) if(transform[key]) p[key]={...p[key],...transform[key]}; }
  replaceAsset(id, assetId) { this.calls.push(['replace', id, assetId]); this.sceneDocument.placements.find(p=>p.id===id).assetId=assetId; }
  setAssetColor(id, color) { this.calls.push(['color', id, color]); this.sceneDocument.assets.find(a=>a.id===id).appearance={color}; }
  undo() { if(this.past.length) this.sceneDocument=this.past.pop(); return true; }
}

const movePlan = () => ({ summary:'move', commands:[{type:'move_asset',placementId:'placement-mug',position:{x:-0.8,y:0.86,z:-2.05}}], questions:[], warnings:[], requiresConfirmation:true });

test('AI Schema rejects unsupported commands and non-finite values', () => {
  assert.equal(validateSceneCommandPlan({summary:'bad',commands:[{type:'eval',code:'alert(1)'}],questions:[],warnings:[],requiresConfirmation:true}).valid, false);
  const plan=movePlan(); plan.commands[0].position.x=Number.NaN;
  assert.equal(validateSceneCommandPlan(plan).valid, false);
});

test('AI preview requires real IDs and does not mutate the scene', () => {
  const editor=new MockEditor(); const executor=new SceneCommandExecutor(editor); const before=structuredClone(editor.sceneDocument);
  const preview=executor.preview(movePlan());
  assert.equal(preview.canApply,true); assert.deepEqual(editor.sceneDocument,before);
  const missing=movePlan(); missing.commands[0].placementId='missing';
  assert.equal(executor.preview(missing).canApply,false);
});

test('AI questions block apply until the user clarifies', () => {
  const executor=new SceneCommandExecutor(new MockEditor()); const plan=movePlan(); plan.questions=['哪一件家具？'];
  assert.equal(executor.preview(plan).canApply,false); assert.throws(()=>executor.apply(plan));
});

test('AI executor applies all five command types through the bridge', () => {
  const editor=new MockEditor(); const executor=new SceneCommandExecutor(editor);
  const plan={summary:'all',commands:[
    {type:'place_asset',assetId:'mug',containerId:'room-memory',position:{x:0,y:0,z:0}},
    {type:'move_asset',placementId:'placement-mug',position:{x:-0.8,y:0.86,z:-2.05}},
    {type:'rotate_asset',placementId:'placement-mug',rotation:{x:0,y:1,z:0}},
    {type:'replace_asset',placementId:'placement-mug',newAssetId:'lamp'},
    {type:'set_material',targetId:'lamp',color:'#aabbcc'},
  ],questions:[],warnings:[],requiresConfirmation:true};
  executor.apply(plan);
  assert.deepEqual(editor.calls.map(call=>call[0]),['add','transform','transform','replace','color']);
});

test('LLM provider reports missing configuration without simulating AI', async () => {
  await assert.rejects(()=>generateSceneCommand({message:'test',sceneDocument:createDemoSceneDocument(),env:{}}),error=>error.status===503);
});

test('LLM provider mock returns validated structured JSON only', async () => {
  const plan=movePlan();
  const fetchImpl=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(plan)}}]})});
  const result=await generateSceneCommand({message:'move mug',sceneDocument:createDemoSceneDocument(),fetchImpl,env:{LLM_API_KEY:'mock-only',LLM_BASE_URL:'https://mock.invalid',LLM_MODEL:'mock-model'}});
  assert.deepEqual(result,plan);
});

test('LLM receives image and scene context without bypassing validation', async () => {
  let sent;
  const fetchImpl=async (_url, options) => { sent=JSON.parse(options.body); return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(movePlan())}}]})}; };
  await generateSceneCommand({message:'参考图片',image:'data:image/png;base64,AAAA',sceneDocument:createDemoSceneDocument(),fetchImpl,env:{LLM_API_KEY:'mock',LLM_BASE_URL:'https://mock.invalid',LLM_MODEL:'mock'}});
  assert.equal(sent.messages[1].content[1].image_url.url,'data:image/png;base64,AAAA');
  assert.match(sent.messages[0].content,/placement-mug/);
});

test('library assets and materials are validated and applied to individual placements or room surfaces', () => {
  const editor = new MockEditor();
  editor.setPlacementAppearance = (id, appearance, material, options) => editor.calls.push(['instance', id, appearance, material?.id, options]);
  editor.setRoomMaterial = (id, surface, material, options) => editor.calls.push(['room', id, surface, material?.id, options]);
  const executor = new SceneCommandExecutor(editor);
  executor.catalog = {assets:[{id:'library-chair',name:'目录椅',category:'椅凳'}],materials:[{id:'wood',name:'木材',category:'木材'}]};
  const plan={summary:'布置',commands:[
    {type:'place_asset',assetId:'library-chair',containerId:'room-memory'},
    {type:'set_material',targetId:'placement-mug',materialId:'wood'},
    {type:'set_material',targetId:'room-memory',surface:'floor',materialId:'wood'},
  ],questions:[],warnings:[],requiresConfirmation:true};
  assert.equal(executor.preview(plan).canApply,true); executor.apply(plan);
  assert.deepEqual(editor.calls.map(c=>c[0]),['add','instance','room']);
  assert.equal(editor.calls[1][1],'placement-mug');
  assert.deepEqual(editor.calls[1][4],{history:false});
  const invalid=structuredClone(plan); invalid.commands[1].materialId='unknown';
  assert.equal(executor.preview(invalid).canApply,false);
});

function crowdedScene() {
  const scene=createDemoSceneDocument();
  const rooms=scene.buildings[0].floors[0].rooms;
  rooms[0].name='客厅';
  rooms.push({...structuredClone(rooms[0]),id:'room-study',name:'书房'});
  const sample=scene.placements[0];
  scene.placements=Array.from({length:120},(_,i)=>({...structuredClone(sample),id:'instance-'+i,assetId:i===118?'lamp':'mug',containerId:i===118?'room-study':rooms[0].id}));
  return scene;
}

async function crowdedReply(message,{plan,selection,image,scene=crowdedScene()}={}) {
  let sent;
  const result=await generateSceneCommand({sceneDocument:scene,message,selection:selection || {roomId:'room-memory',placementId:'instance-119'},image,
    env:{LLM_API_KEY:'test',LLM_BASE_URL:'https://example.invalid',LLM_MODEL:'test'},
    fetchImpl:async(_url,options)=>{
      const body=JSON.parse(options.body);
      sent=JSON.parse(body.messages[0].content.split('上下文：').at(-1));
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(plan || {...movePlan(),commands:[]})}}]})};
    }});
  return {result,sent};
}

test('crowded home keeps the selected tail placement and limits image context',async()=>{
  const plan={...movePlan(),commands:[{type:'move_asset',placementId:'instance-119',offset:{x:0.2,y:0,z:0}}]};
  const {result,sent}=await crowdedReply('把选中的家具向右移动20厘米',{plan,image:'data:image/png;base64,AAAA'});
  assert.equal(sent.selectedFurniture,'instance-119');
  assert.equal(sent.placements[0].id,'instance-119');
  assert.ok(sent.placements.length<=7 && !sent.placements.some(p=>p.id==='instance-118'));
  assert.equal(result.commands[0].placementId,'instance-119');
  assert.match(result.warnings.join(),/7\/120/);
});

test('explicit remote room wins over current selection and a previous whole-home request',async()=>{
  const {sent,result}=await crowdedReply('先前要求：调整全屋。\n助手对该要求的提问：请确定范围\n用户的新回复：先把书房的灯改成蓝色',
    {plan:{...movePlan(),commands:[{type:'set_material',targetId:'instance-118',color:'#174a9f'}]}});
  assert.deepEqual(sent.placements.map(x=>x.id),['instance-118']);
  assert.equal(sent.selectedFurniture,undefined);
  assert.deepEqual(sent.rooms.map(r=>r.id),['room-study']);
  assert.equal(result.commands[0].targetId,'instance-118');
});

test('whole-house and oversize room batches ask for a scope before contacting the provider',async()=>{
  for(const request of ['把全屋家具统一改成蓝色','所有茶杯向右移20厘米','把客厅所有的杯子移动到右边','先前要求：移动全屋家具。\n助手对该要求的提问：请选定一个房间。\n用户的新回复：确认']){
    const {sent,result}=await crowdedReply(request);
    assert.equal(sent,undefined);
    assert.deepEqual(result.commands,[]);
    assert.ok(result.questions.length && result.requiresConfirmation);
  }
});

test('a short confirmation retains a previously named remote room',async()=>{
  const {sent}=await crowdedReply('先前要求：书房台灯改蓝色。\n助手对该要求的提问：确认这个颜色吗？\n用户的新回复：确认这个颜色，请给出方案。');
  assert.deepEqual(sent.rooms.map(r=>r.id),['room-study']);
  assert.equal(sent.selectedFurniture,undefined);
});

test('a real but omitted item or shared asset cannot be substituted for selected furniture',async()=>{
  for(const targetId of ['instance-118','instance-0','mug']){
    const {result}=await crowdedReply('仅将选中的家具改成蓝色',{plan:{...movePlan(),commands:[{type:'set_material',targetId,color:'#174a9f'}]}});
    assert.deepEqual(result.commands,[]);
    assert.ok(result.questions.length);
  }
});

test('a regular 34-piece text request keeps its full original scene',async()=>{
  const scene=crowdedScene();
  scene.placements=scene.placements.slice(0,34);
  const {sent,result}=await crowdedReply('看一下客厅',{scene});
  assert.equal(sent.placements.length,34);
  assert.equal(sent.scope,undefined);
  assert.deepEqual(result.warnings,[]);
});
