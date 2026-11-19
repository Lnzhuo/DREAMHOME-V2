import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.DEMO_URL || 'http://127.0.0.1:4196';
const output = path.resolve(process.env.DEMO_HERO || 'public/room-references/dreamhome-showcase.jpg');
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(base);
  await page.locator('[data-preset="sage"]').click();
  await page.waitForFunction(() => {
    const app=window.__dreamhome;
    return app?.sceneDocument.placements.length && app.sceneDocument.placements.every(p=>app.game.getObjectGroup(p.id)?.userData.hasRealModel);
  });
  await page.locator('[data-view=walk]').click();
  const jpg = await page.evaluate(() => {
    const game=window.__dreamhome.game;
    const camera=game.camera.clone();
    camera.aspect=1.82;
    camera.position.set(5.52,1.45,4.72).add(game.originOf(game.activeRoomId));
    camera.lookAt(game.originOf(game.activeRoomId).add({x:2.68,y:.88,z:1.58}));
    camera.updateProjectionMatrix();
    game.renderer.setSize(1365,750,false);
    game.renderer.render(game.scene,camera);
    return game.renderer.domElement.toDataURL('image/jpeg',.93).split(',')[1];
  });
  await fs.writeFile(output,Buffer.from(jpg,'base64'));
  console.log(output);
} finally { await browser.close(); }
