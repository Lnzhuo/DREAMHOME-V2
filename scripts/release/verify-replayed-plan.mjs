import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const base=process.env.DEMO_URL;
const out=path.resolve(process.env.DEMO_OUTPUT);
const input=JSON.parse(await fs.readFile(process.env.DEMO_REPLAY_FILE,'utf8'));
const [move,...remaining]=input.cases;
const color=remaining.at(-1);
assert(move.appliedAndUndone && color.plan.commands.some(c=>c.type==='set_material'));
const trace={date:new Date().toISOString(),responseMode:'先前双包实测的真实响应回放',cases:[],pageErrors:[],externalRequestOrigins:[]};
const external=new Set();
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await browser.newContext({viewport:{width:1000,height:700}});
ctx.on('request',request=>{
  const url=new URL(request.url());
  if(/^https?:$/.test(url.protocol)&&url.origin!==new URL(base).origin) external.add(url.origin);
});
ctx.on('page',page=>page.on('pageerror',err=>trace.pageErrors.push(err.message)));
const save=()=>fs.writeFile(path.join(out,'ai-e2e.json'),JSON.stringify(trace,null,2));
try {
  let page=await ctx.newPage();
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'打开已布置样板间'}).click({timeout:35000});
  await page.waitForFunction(()=>window.__dreamhome?.sceneDocument.placements.length>0,null,{timeout:50000});
  console.log('已在独立浏览器打开随包客厅');
  const actions=await page.evaluate(({move,color})=>{
    const app=window.__dreamhome;
    const get=id=>app.sceneDocument.placements.find(p=>p.id===id);
    const moveCmd=move.commands.find(c=>c.type==='move_asset');
    const before={...get(moveCmd.placementId).position};
    if(!app.executor.preview(move).canApply) throw Error('原始移动方案不能应用于此场景');
    app.executor.apply(move);
    const moved={...get(moveCmd.placementId).position};
    app.executor.undo();
    const undone={...get(moveCmd.placementId).position};
    const rgb=color.commands.find(c=>c.type==='set_material');
    if(!app.executor.preview(color).canApply) throw Error('原始改色方案不能应用于此场景');
    app.executor.apply(color);
    return {before,moved,undone,projectId:app.sceneDocument.projectId,assetId:rgb.targetId,expectedColor:rgb.color,applied:get(rgb.targetId).appearance.color};
  },{move:move.plan,color:color.plan});
  assert.deepEqual(actions.undone,actions.before);
  assert(Math.abs(actions.moved.x-actions.before.x-0.2)<0.012);
  assert.equal(actions.applied,actions.expectedColor);
  trace.cases.push({...move,appliedAndUndone:true},{...color,appliedColor:actions.applied});
  await page.waitForFunction(async a=>{
    const saved=await window.__dreamhome.projectRepository.loadProject(a.projectId);
    return saved?.placements.find(p=>p.id===a.assetId)?.appearance?.color===a.expectedColor;
  },actions,{timeout:45000});
  trace.cases.at(-1).persistedInIndexedDB=true;
  await save();
  console.log('原始命令已应用，颜色已写入 IndexedDB');
  const original=page;
  page=await ctx.newPage();
  await original.close();
  await page.goto(base,{waitUntil:'commit'});
  await page.waitForFunction(a=>window.__dreamhome?.sceneDocument.projectId===a.projectId && window.__dreamhome.sceneDocument.placements.find(p=>p.id===a.assetId)?.appearance?.color===a.expectedColor,actions,{timeout:70000});
  trace.cases.at(-1).appliedAndRestored=true;
  trace.restoreMethod='同一独立浏览器会话关闭原页并打开新页面，核对项目 ID、家具实例 ID 与颜色';
  trace.externalRequestOrigins=[...external];
  assert.deepEqual(trace.externalRequestOrigins,[]);
  assert.deepEqual(trace.pageErrors,[]);
  console.log('独立新页面恢复相同项目、家具及颜色');
} finally {
  await save();
  await browser.close();
}
