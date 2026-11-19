import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base=process.env.DEMO_URL || 'http://127.0.0.1:4196';
const output=path.resolve(process.env.DEMO_OUTPUT || 'docs/verification/v2/residence');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(330000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.getByRole('button',{name:'打开三室两厅样板房'}).click();
  await page.waitForFunction(()=>window.__dreamhome?.sceneDocument.placements.length>25);
  const before=await page.evaluate(()=>window.__dreamhome.sceneDocument.placements);
  const id=await page.evaluate(()=>{
    const d=window.__dreamhome.sceneDocument;
    const table=d.assets.find(a=>String(a.providerTaskId)==='8395285');
    return d.placements.find(p=>p.assetId===table.id).id;
  });
  await page.locator('.dh-space-item').filter({hasText:'原木茶几'}).click();
  const panel=page.locator('.dh-ai-panel');
  const prompt='把选中的客厅原木茶几向右移10厘米，其他家具和房间保持原样。';
  const answer=page.waitForResponse(r=>r.url().endsWith('/api/ai/scene-command') && r.request().method()==='POST',{timeout:330000});
  await panel.getByLabel('设计指令').fill(prompt);await panel.getByLabel('设计指令').press('Enter');
  const response=await answer,plan=await response.json();assert.equal(response.status(),200,JSON.stringify(plan));
  assert.equal(plan.commands.length,1,JSON.stringify(plan));
  const command=plan.commands[0],prior=before.find(p=>p.id===id);
  assert.equal(command.type,'move_asset');assert.equal(command.placementId,id);
  assert(Math.abs(command.position.x-prior.position.x-.10)<.001);
  assert.equal(command.position.y,prior.position.y);assert.equal(command.position.z,prior.position.z);
  await panel.getByRole('button',{name:'应用修改'}).click();
  const after=await page.evaluate(()=>window.__dreamhome.sceneDocument.placements);
  assert.deepEqual(after.filter(p=>p.id!==id),before.filter(p=>p.id!==id));
  assert.equal(after.find(p=>p.id===id).position.x,command.position.x);
  await panel.getByRole('button',{name:'撤销上次修改'}).click();
  assert.deepEqual(await page.evaluate(()=>window.__dreamhome.sceneDocument.placements),before);
  assert.deepEqual(errors,[]);
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'apartment-ai.json'),JSON.stringify({date:new Date().toISOString(),model:'dreamhome-qwen3-vl',prompt,status:response.status(),plan,placed:before.length,othersUnchanged:after.length-1,undoRestored:true,pageErrors:errors},null,2));
  console.log('真实本机模型在整套住宅中按指令修改一件家具，其余 '+(after.length-1)+' 件保持原样，撤销恢复。');
} finally {await browser.close();}
