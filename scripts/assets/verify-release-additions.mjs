import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';

const [base, input, out] = process.argv.slice(2);
const {assets, indexSHA256} = JSON.parse(await fs.readFile(input,'utf8'));
assert(assets.length > 0);
await fs.mkdir(out,{recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server']});
async function verifyImage(page, url, expectedHash) {
  const actual = await page.evaluate(async imageUrl => {
    const response = await fetch(imageUrl);
    if (!response.ok) throw Error('图片读取失败 '+response.status);
    const bytes = await response.arrayBuffer();
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const decoded = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    if (!decoded) throw Error('图像尺寸无效');
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2,'0')).join('');
  }, url);
  assert.equal(actual, expectedHash);
  return actual;
}
const results=[];
const errors=[];
try {
  for(let i=0;i<assets.length;i+=8) {
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    const models=new Map();
    page.on('response',response=>{
      const modelPath=new URL(response.url()).pathname;
      if(response.ok() && /^\/api\/library\/models\/[^/]+\/model\.glb$/.test(modelPath)) {
        models.set(modelPath,response.body().then(bytes=>createHash('sha256').update(bytes).digest('hex')).catch(()=>null));
      }
    });
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    const digest=await page.evaluate(async()=>{
      const raw=await (await fetch('/api/library/index.json',{cache:'no-store'})).arrayBuffer();
      const hash=await crypto.subtle.digest('SHA-256',raw);
      return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
    });
    if(indexSHA256){
      assert.equal(digest,indexSHA256);
      assert.equal((await (await page.request.get(new URL('/release.json',base).href)).json()).indexSHA256,indexSHA256);
    }
    await page.locator('[data-mode="room"] .dh-template-card').first().click();
    await page.waitForFunction(()=>window.__dreamhome?.assetLibrary?.catalogAssets?.length>0);
    const manual=page.getByRole('button',{name:'手动调整',exact:true});
    if(await manual.isVisible()) await manual.click();
    for(const a of assets.slice(i,i+8)) {
      const search=page.locator('[data-field="asset-search"]');
      await search.fill(a.name);
      const card=page.locator('[data-asset-id="'+a.id+'"]');
      await card.waitFor();
      const thumb=card.locator('img').first();
      await thumb.scrollIntoViewIfNeeded();
      await thumb.evaluate(img=>img.decode());
      const thumbnailSha256=await verifyImage(page,await thumb.getAttribute('src'),a.thumbnail.sha256);
      if(a.referenceSource?.licenseUrl){
        const license=card.locator('details').filter({has:page.getByText('来源与许可',{exact:true})});
        await license.locator('summary').click();
        assert.equal(await license.getByText('查看参考照片许可',{exact:true}).getAttribute('href'),a.referenceSource.licenseUrl);
        assert((await license.innerText()).includes(a.referenceSource.author));
        if(a.referenceSource.creator) assert((await license.innerText()).includes(a.referenceSource.creator));
        await license.locator('summary').click();
      }
      await card.getByText('预览模型',{exact:true}).click();
      const overlay=page.locator('.dh-preview-modal');
      await overlay.locator('canvas').waitFor();
      assert.equal(await overlay.locator('h2').innerText(),a.name);
      let modelHash=await models.get(a.modelUrl);
      if(!modelHash){
        const remote=await page.request.get(new URL(a.modelUrl,base).href);
        assert(remote.ok());
        modelHash=createHash('sha256').update(await remote.body()).digest('hex');
      }
      assert.equal(modelHash,a.archive.sha256);
      if(a.source==='lux3d_image'){
        await overlay.locator('img.dh-reference-photo').evaluate(img=>img.decode());
        assert((await overlay.innerText()).includes(a.referenceSource.license));
      }
      if(i===0 && results.length<2) await page.screenshot({path:path.join(out,a.providerTaskId+'-预览.png')});
      await overlay.getByRole('button',{name:'关闭预览'}).click();
      await card.getByText('放入房间',{exact:true}).click();
      await page.waitForFunction(id=>{
        const app=window.__dreamhome;const p=app.sceneDocument.placements.find(x=>x.assetId===id);
        return !!p && app.game.getObjectGroup(p.id)?.userData.hasRealModel;
      },a.id,{timeout:120000});
      const placed=await page.evaluate(id=>window.__dreamhome.sceneDocument.placements.find(x=>x.assetId===id).id,a.id);
      await page.locator('[data-view="2d"]').click();
      const footprint=page.locator('[data-placement-id="'+placed+'"]');
      await footprint.waitFor({state:'visible'});
      const plan=await footprint.evaluate(rect=>rect.planImage?.getAttribute('href'));
      assert.equal(new URL(plan,base).pathname,a.planThumbnailUrl);
      const planSha256=await verifyImage(page,plan,a.planThumbnail.sha256);
      if(i===0 && results.length===0) await page.screenshot({path:path.join(out,a.providerTaskId+'-平面.png')});
      await page.locator('[data-view="3d"]').click();
      const removed=await page.evaluate(id=>{
        const app=window.__dreamhome;
        const real=!!app.game.getObjectGroup(id)?.userData.hasRealModel;
        app.editor.removePlacement(id,{history:false});
        return real;
      },placed);
      assert(removed);
      results.push({id:a.id,taskId:a.providerTaskId,name:a.name,catalogSha256:digest,modelSha256:modelHash,thumbnailSha256,planSha256,preview:true,thumbnail:true,placement3D:true,footprint2D:plan});
      await fs.writeFile(path.join(out,'逐件公网验收.json'),JSON.stringify({base,results,errors},null,2));
      console.log(results.length,a.name);
    }
    await context.close();
  }
  assert.equal(results.length,assets.length);
  const local=['127.0.0.1','localhost'].includes(new URL(base).hostname);
  assert.deepEqual(errors.filter(e=>!(local && e==='WebSocket closed without opened.')),[]);
} finally {await browser.close();}

