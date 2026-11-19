import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.DEMO_URL || 'http://127.0.0.1:4196';
const out=path.resolve(process.env.DEMO_OUTPUT || 'docs/verification/v2/local-ai');
await fs.mkdir(out,{recursive:true});
const compact=process.env.DEMO_CHECK_STATE_ONLY==='1';
const localOnly=process.env.DEMO_LOCAL_ONLY==='1';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader',...(localOnly?['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']:[])]});
const recording=Boolean(process.env.RECORD_DEMO);
const ctx=await browser.newContext({viewport:compact?{width:1024,height:700}:{width:1440,height:900},...(recording ? {recordVideo:{dir:out,size:{width:1440,height:900}}} : {})});
const externalRequests=new Set();
if(localOnly) ctx.on('request',request=>{
  const dest=new URL(request.url());
  if(/^https?:$/.test(dest.protocol)&&dest.origin!==new URL(base).origin) externalRequests.add(dest.origin);
});
let page=await ctx.newPage();page.setDefaultTimeout(330000);
const start=Date.now();
const evidence={date:new Date().toISOString(),model:'dreamhome-qwen3-vl',cases:[],pageErrors:[],timeline:{}};
const mark=label=>{evidence.timeline[label]=(Date.now()-start)/1000;};
const hold=ms=>recording?page.waitForTimeout(ms):Promise.resolve();
const capturePage=file=>process.env.DEMO_CHECK_STATE_ONLY==='1' ? Promise.resolve() : page.screenshot({path:path.join(out,file)});
page.on('pageerror',e=>evidence.pageErrors.push(e.message));
try {
  await page.goto(base);
  await page.locator('[data-preset="sage"]').click();
  await page.waitForFunction(()=>window.__dreamhome?.sceneDocument.placements.length>0);
  await page.waitForFunction(()=>Object.values(window.__dreamhome.game.placementGroups).every(g=>g.userData.hasRealModel));
  const data=await page.evaluate(()=>{
    const d=window.__dreamhome.sceneDocument;
    const match=name=>d.placements.find(p=>d.assets.find(a=>a.id===p.assetId)?.name.includes(name));
    return {table:match('原木茶几'),sofa:match('奶油色双人沙发')};
  });
  const panel=page.locator('.dh-ai-panel');
  const input=panel.getByLabel('设计指令');
  async function request(prompt,image) {
    await input.scrollIntoViewIfNeeded();
    if(image) await panel.locator('[data-ai-image]').setInputFiles(image);
    const response=page.waitForResponse(r=>r.url().endsWith('/api/ai/scene-command')&&r.request().method()==='POST',{timeout:330000});
    await input.fill(prompt);await input.press('Enter');
    const r=await response;const body=await r.json();
    evidence.cases.push({prompt,image:image?path.basename(image):undefined,status:r.status(),plan:body});
    await fs.writeFile(path.join(out,'ai-e2e.json'),JSON.stringify(evidence,null,2));
    assert.equal(r.status(),200,JSON.stringify(body));
    return body;
  }
  const move=await request('把原木茶几从当前位置向右移动20厘米，只移动这一件，保留它的高度和前后位置。');
  const cmd=move.commands.find(c=>c.type==='move_asset' && c.placementId===data.table.id);
  assert(cmd,'茶几移动命令缺失');
  assert(Math.abs(cmd.position.x-data.table.position.x-.2)<.012);
  assert(Math.abs(cmd.position.z-data.table.position.z)<.012);
  assert.equal(cmd.position.y,data.table.position.y);
  await panel.getByText('应用修改',{exact:true}).scrollIntoViewIfNeeded();
  mark('movePreview');await capturePage('01-ai-plan.png');await hold(1600);
  await panel.getByText('应用修改',{exact:true}).click();
  const readPlacement=id=>page.evaluate(id=>window.__dreamhome.sceneDocument.placements.find(p=>p.id===id),id);
  assert.equal((await readPlacement(data.table.id)).position.x,cmd.position.x);
  await hold(1700);await panel.getByText('撤销上次修改',{exact:true}).click();await hold(850);
  assert.equal((await readPlacement(data.table.id)).position.x,data.table.position.x);
  evidence.cases[0].appliedAndUndone=true;
  // A plain blue material swatch gives the vision result an independently checkable target.
  const swatch=path.join(out,'材料色样.png');
  const swatchBytes=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=300;canvas.height=180;
    const drawing=canvas.getContext('2d');drawing.fillStyle='#174a9f';drawing.fillRect(0,0,300,180);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await fs.writeFile(swatch,Buffer.from(swatchBytes,'base64'));
  await page.locator('.dh-space-item').filter({hasText:'奶油色双人沙发'}).click();
  let vision=await request('请把选中的奶油色双人沙发改成参考图片的主色。只改这一件，请给出可以预览的改色方案。',swatch);
  if (!vision.commands.length && vision.questions?.length) {
    vision=await request('确认使用你从色样中识别出的颜色，请生成这件沙发的改色命令供我预览。',swatch);
  }
  const color=vision.commands.find(c=>c.type==='set_material'&&c.targetId===data.sofa.id)?.color;
  assert.match(color||'',/^#[0-9a-f]{6}$/i);
  const applyColor = panel.getByRole('button',{name:'应用修改',exact:true});
  await applyColor.scrollIntoViewIfNeeded();
  mark('colorPreview');await hold(1500);
  const [red,green,blue]=color.slice(1).match(/../g).map(n=>parseInt(n,16));assert(blue>red+25 && blue>green+10);
  await applyColor.click();
  assert.equal((await readPlacement(data.sofa.id)).appearance.color,color);
  await page.waitForFunction(id=>{const g=window.__dreamhome.game.getObjectGroup(id);return !g.userData.requestedRevision || g.userData.contentRevision===g.userData.requestedRevision;},data.sofa.id);
  await page.waitForFunction(()=>Object.values(window.__dreamhome.game.placementGroups).every(g=>g.userData.hasRealModel));
  mark('colorApplied');await capturePage('02-ai-image-applied.png');await hold(3600);
  if(compact) {
    await page.waitForFunction(async({id,color})=>{
      const app=window.__dreamhome;
      const saved=await app.projectRepository.loadProject(app.sceneDocument.projectId);
      return saved?.placements.find(p=>p.id===id)?.appearance?.color===color;
    },{id:data.sofa.id,color});
    evidence.cases.at(-1).persistedInIndexedDB=true;
    const prior=page;
    page=await ctx.newPage();page.setDefaultTimeout(90000);
    page.on('pageerror',e=>evidence.pageErrors.push(e.message));
    await prior.close();
    await page.goto(base,{waitUntil:'commit'});
    evidence.restoreMethod='核实 IndexedDB 后关闭原页，在同一浏览器会话打开新页面';
  } else await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__dreamhome));
  assert.equal((await readPlacement(data.sofa.id)).appearance.color,color);
  evidence.cases.at(-1).appliedAndRestored=true;
  if(localOnly) {evidence.externalRequestOrigins=[...externalRequests];assert.deepEqual(evidence.externalRequestOrigins,[]);}
  assert.deepEqual(evidence.pageErrors,[]);
  console.log('真实多模态推理、文字位移、图片主色、人工确认、撤销及刷新通过');
 } catch(error) {
  console.error(await page.locator('.dh-ai-messages').innerText({timeout:2500}).catch(()=>''));throw error;
} finally {
  await fs.writeFile(path.join(out,'ai-e2e.json'),JSON.stringify(evidence,null,2));
  const video=page.video();await ctx.close();
  if(video) await fs.rename(await video.path(),path.join(out,'assistant.webm'));
  await browser.close();
}
