import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.DEMO_URL || 'http://127.0.0.1:4190';
const out=path.resolve(process.env.DEMO_OUTPUT || 'docs/verification/v2/residence');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await browser.newContext({viewport:{width:1440,height:900},...(process.env.RECORD_DEMO?{recordVideo:{dir:out,size:{width:1440,height:900}}}:{})});
const page=await ctx.newPage();
const errors=[];page.on('pageerror',err=>errors.push(err.message));
page.setDefaultTimeout(60000);
const allLoaded=()=>page.waitForFunction(()=>{
  const a=window.__dreamhome;
  return a?.sceneDocument.placements.length>0 && a.sceneDocument.placements.every(p=>a.game.getObjectGroup(p.id)?.userData.hasRealModel);
},{},{timeout:120000});
const start=Date.now();
const timeline={};
const shot=async name=>{timeline[name]=(Date.now()-start)/1000;await page.screenshot({path:path.join(out,name+'.png')});
  if(process.env.RECORD_DEMO) await page.waitForTimeout(2400);};
const room=type=>page.evaluate(t=>{const a=window.__dreamhome; const r=a.sceneDocument.buildings[0].floors[0].rooms.find(r=>r.roomType===t);return {name:r.name,id:r.id};},type);
const result={};
let desktopClosed=false;
async function finishDesktop(){
  if(desktopClosed) return;
  desktopClosed=true;
  const video=page.video();await ctx.close();
  if(video) await fs.rename(await video.path(),path.join(out,'residence.webm'));
}
try {
  await page.goto(base);
  await page.getByRole('button',{name:'打开三室两厅样板房'}).click();
  await allLoaded();
  result.residence=await page.evaluate(()=>{
    const a=window.__dreamhome,s=a.sceneDocument;
    return {name:s.name,placements:s.placements.length,uniqueAssets:s.assets.length,
      lux3dPlacements:s.placements.filter(p=>s.assets.find(x=>x.id===p.assetId)?.providerTaskId).length,
      rooms:s.buildings[0].floors[0].rooms.map(r=>({name:r.name,id:r.id,placements:s.placements.filter(p=>p.containerId===r.id).length}))};
  });
  assert(result.residence.placements>=30 && result.residence.lux3dPlacements>=10);
  await page.getByRole('button',{name:'全景',exact:true}).click();
  await page.waitForTimeout(1300);await shot('01-home');
  await page.locator('[data-view="2d"]').click();await shot('02-plan');
  const bath=await room('bathroom');
  await page.locator('.dh-space-item').filter({hasText:bath.name}).first().click();
  await page.locator('[data-view="3d"]').click();
  await page.locator('[data-view="walk"]').click();
  await page.waitForTimeout(650);await shot('03-bathroom');
  await page.locator('[data-view="3d"]').click();
  await page.locator('[data-action="save"]').click();
  await page.waitForFunction(()=>document.querySelector('.dh-save-state').dataset.state==='saved');
  await page.locator('.dh-files summary').click();
  const pending=page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download=await pending;
  const design=path.join(out,'晴木之家_三室两厅.dreamhome');
  await download.saveAs(design);
  result.portableBytes=(await fs.stat(design)).size;
  await finishDesktop();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(base);await phone.getByRole('button',{name:'打开已布置样板间'}).click();
  await phone.waitForFunction(()=>window.__dreamhome?.sceneDocument.placements.length>0,null,{timeout:65000,polling:100});
  await phone.locator('.dh-mobile-panels [data-panel="left"]').click();
  await phone.locator('[data-field=asset-search]').fill('沙发');
  assert(await phone.locator('.dh-asset-card[data-asset-id]').count()>0);
  await phone.locator('.dh-mobile-panels [data-panel="left"]').click();
  await phone.getByRole('button',{name:'AI 助手',exact:true}).click();
  assert(await phone.getByLabel('设计指令').isVisible());
  assert(!(await phone.locator('[data-room] input[name=width]').isVisible()));
  await phone.getByRole('button',{name:'手动调整',exact:true}).click();
  assert(await phone.locator('[data-room] input[name=width]').isVisible());
  await phone.locator('.dh-mobile-panels [data-panel="right"]').click();
  result.mobile=await phone.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,
    canvas:Math.round(document.querySelector('.dh-canvas').getBoundingClientRect().width)}));
  assert(result.mobile.document<=391 && result.mobile.viewport<=391);
  await phone.screenshot({path:path.join(out,'04-mobile.png')});await mobile.close();
  const reopen=await browser.newContext({viewport:{width:1300,height:865}}), clean=await reopen.newPage();
  clean.on('pageerror',e=>errors.push(e.message));
  await clean.goto(base);await clean.locator('.dh-template-card').first().click();await clean.waitForFunction(()=>Boolean(window.__dreamhome));
  await clean.locator('[data-action=import]').setInputFiles(design);
  await clean.waitForFunction(n=>window.__dreamhome.sceneDocument.name===n,result.residence.name);
  const restored=await clean.evaluate(()=>window.__dreamhome.sceneDocument.placements.length);
  assert.equal(restored,result.residence.placements);result.restored=restored;await reopen.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(result));
} finally {
  await finishDesktop();await browser.close();
  await fs.writeFile(path.join(out,'residence-checks.json'),JSON.stringify({...result,errors,timeline},null,2));
}
