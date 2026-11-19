import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.env.DEMO_URL || 'http://127.0.0.1:4174/';
const OUTPUT = process.env.DEMO_VIDEO || path.resolve(ROOT, 'data', 'verification', 'DREAMHOME-demo.webm');
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
const realAssets = process.env.REAL_ASSETS_FILE
  ? JSON.parse(await fs.readFile(process.env.REAL_ASSETS_FILE, 'utf8')).filter((entry) => entry.job?.status === 'succeeded').map((entry) => entry.job.outputAsset)
  : [];
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: path.join(path.dirname(OUTPUT), 'raw'), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
async function caption(text, wait = 2500) {
  await page.evaluate((message) => {
    let overlay = document.getElementById('demo-caption');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'demo-caption';
      overlay.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;padding:12px 22px;background:rgba(25,23,20,.88);color:#fff;border-radius:12px;font:600 16px/1.5 sans-serif;box-shadow:0 8px 30px #0003;pointer-events:none;max-width:80%;text-align:center';
      document.body.appendChild(overlay);
    }
    overlay.textContent = message;
  }, text);
  await page.waitForTimeout(wait);
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__dreamhome));
await caption('DREAMHOME 造梦家 · 5.2m × 4.8m 奶油风客厅', 3500);
await page.locator('[data-view="2d"]').click();
await caption('2D / 3D 共用 SceneDocument · 选择与位置实时同步', 2500);
const footprint = page.locator('[data-placement-id="placement-mug"]');
const box = await footprint.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 15, { steps: 16 });
await page.mouse.up();
await caption('在 2D 平面图中直接移动家具', 2500);
await page.locator('[data-view="3d"]').click();
await page.getByRole('button',{name:'手动调整',exact:true}).click();
await page.locator('.dh-space-item').filter({ hasText: '缺口马克杯' }).last().click();
await caption('真实 Three.js 场景 · 选择、移动、旋转、缩放', 2500);
const point = await page.evaluate(() => {
  const { game } = window.__dreamhome;
  const vector = game.getObjectGroup('mug').position.clone();
  vector.y += 0.1;
  vector.project(game.camera);
  const rect = game.renderer.domElement.getBoundingClientRect();
  return { x: rect.left + ((vector.x + 1) / 2) * rect.width, y: rect.top + ((1 - vector.y) / 2) * rect.height };
});
await page.mouse.move(point.x, point.y);
await page.mouse.down();
await page.mouse.move(point.x + 70, point.y + 20, { steps: 16 });
await page.mouse.up();
await page.locator('[data-mode="rotate"]').click();
await page.locator('[data-field="rotation"]').fill('45');
await page.locator('[data-field="rotation"]').press('Tab');
await page.locator('[data-mode="scale"]').click();
await page.locator('[data-field="scale"]').fill('1.2');
await page.locator('[data-field="scale"]').press('Tab');
await caption('TransformControls 与属性面板同步写入 SceneDocument', 3000);

if (realAssets.length) {
  await page.evaluate(async (assets) => {
    const app = window.__dreamhome;
    for (const asset of assets) {
      const response = await fetch(asset.modelUrl);
      if (!response.ok) throw new Error(`真实模型下载失败：${asset.name}`);
      await app.assetRepository.putAsset({ asset, blob: await response.blob() });
    }
    await app.assetLibrary.refresh();
  }, realAssets);
  const first = realAssets[0];
  const card = page.locator('.dh-asset-card').filter({ hasText: first.name });
  await card.locator('button').filter({ hasText: '预览模型' }).click();
  await page.waitForSelector('.dh-preview-modal canvas');
  await caption(`真实 Lux3D 文生模型 · ${first.name} · taskId=${first.providerTaskId}`, 3500);
  await page.locator('.dh-preview-close').click();
  const positions = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1.2 }, { x: 1.6, y: 0, z: -1.2 }];
  for (const [index, asset] of realAssets.entries()) {
    await page.evaluate(({ asset, position }) => window.__dreamhome.editor.addAsset(asset, { position }), { asset, position: positions[index] || positions[0] });
    await page.waitForTimeout(1000);
    await caption(`真实 Lux3D 资产已放入房间：${asset.name}`, 1800);
  }
  await page.evaluate((assetId) => {
    const app = window.__dreamhome;
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    app.editor.selectPlacement(placement.id);
  }, first.id);
  const luxPoint = await page.evaluate((assetId) => {
    const app = window.__dreamhome;
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    const vector = app.game.placementGroups[placement.id].position.clone();
    vector.y += 0.4;
    vector.project(app.game.camera);
    const rect = app.game.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((vector.x + 1) / 2) * rect.width, y: rect.top + ((1 - vector.y) / 2) * rect.height };
  }, first.id);
  await page.mouse.move(luxPoint.x, luxPoint.y);
  await page.mouse.down();
  await page.mouse.move(luxPoint.x + 65, luxPoint.y - 10, { steps: 14 });
  await page.mouse.up();
  await caption('真实 Lux3D 模型同样支持鼠标编辑与撤销', 3000);
} else {
  await page.locator('[data-action="glb"]').setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'upload-mug-test.glb'));
  await page.waitForFunction(() => document.querySelector('.dh-upload-state').textContent.includes('已导入'));
  await caption('真实 GLB 文件导入 · 来源为用户上传（非 Lux3D）', 3000);
  const card = page.locator('.dh-asset-card').filter({ hasText: 'upload-mug-test' });
  await card.locator('button').filter({ hasText: '预览模型' }).click();
  await page.waitForSelector('.dh-preview-modal canvas');
  await caption('GLB 模型预览与 bounding box 估算尺寸', 3000);
  await page.locator('.dh-preview-close').click();
  await card.locator('button').filter({ hasText: '放入房间' }).click();
  await page.waitForFunction(() => {
    const app = window.__dreamhome;
    return app.game.getObjectGroup(app.editor.selectedId)?.userData.hasRealModel;
  });
  await caption('将真实 GLB 家具放入房间并可继续编辑', 3000);
}
await page.locator('[data-action="save"]').click();
await page.waitForFunction(() => document.querySelector('.dh-save-state').textContent.includes('快照'));
await caption('手动保存版本快照 · SceneDocument 与 GLB 二进制持久化', 2500);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__dreamhome));
await page.waitForTimeout(1800);
await caption('刷新后自动重新打开项目 · 家具、位置和 GLB 完整恢复', 3500);
await caption(realAssets.length ? '真实 Lux3D 家具已生成并入室 · 全部使用真实运行画面' : '真实 Lux3D / LLM：等待费用审批，本视频不使用 Mock 冒充', 4000);

const video = page.video();
await context.close();
await browser.close();
const recorded = await video.path();
await fs.copyFile(recorded, OUTPUT);
const stat = await fs.stat(OUTPUT);
console.log(JSON.stringify({ video: OUTPUT, bytes: stat.size, source: 'real Playwright screen recording', lux3dTaskIds: realAssets.map((asset) => asset.providerTaskId), llm: 'not executed' }, null, 2));
