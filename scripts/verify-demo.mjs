/**
 * 用本机 Edge/Chrome 无头模式验证 Demo：渲染、画布拾取、记忆卡片、收藏、结局。
 * 运行前先启动 npm run dev。截图输出到 ../shots。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.resolve(ROOT, '..', 'shots');
const BASE = process.env.DEMO_URL || 'http://127.0.0.1:5173/';
const EXECUTABLE =
  process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

await fs.mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name) });
const report = { steps: [], errors };

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__memoryHunt), { timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot('01-start.png');
  report.steps.push('启动页渲染完成');

  await page.click('#start-btn');
  await page.waitForTimeout(2200);
  await shot('02-room.png');
  report.steps.push('3D 房间渲染完成');

  // 真实画布点击：把马克杯的世界坐标投影到屏幕，再点击验证射线拾取
  const point = await page.evaluate(() => {
    const { game } = window.__memoryHunt;
    const group = game.objectGroups.mug;
    const vector = group.position.clone();
    vector.y += 0.1;
    vector.project(game.camera);
    const rect = game.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - vector.y) / 2) * rect.height,
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(1400);
  let opened = await page.evaluate(
    () => document.querySelector('.overlay:not([hidden]) .card h3')?.textContent || null,
  );
  report.canvasPick = opened;
  if (!opened) {
    report.steps.push('画布点击未命中，改用内部接口打开卡片继续验证');
    await page.evaluate(() => window.__memoryHunt.game.onObjectClick('mug'));
    await page.waitForTimeout(1200);
    opened = await page.evaluate(
      () => document.querySelector('.overlay:not([hidden]) .card h3')?.textContent || null,
    );
  }
  await shot('03-memory.png');
  report.steps.push(`记忆卡片打开：${opened}`);

  await page.click('.overlay:not([hidden]) .primary-btn');
  await page.waitForTimeout(600);
  report.countAfterFirst = await page.textContent('#found-count');

  await page.click('[data-action="behind"]');
  await page.waitForTimeout(400);
  await shot('04-behind.png');
  await page.click('.overlay:not([hidden]) [data-close]');
  report.steps.push('制作幕后面板正常');

  for (const id of ['lamp', 'book', 'plant', 'plush', 'sneaker']) {
    await page.evaluate((objectId) => window.__memoryHunt.game.onObjectClick(objectId), id);
    await page.waitForTimeout(400);
    await page.click('.overlay:not([hidden]) .primary-btn');
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2800);
  report.countFinal = await page.textContent('#found-count');
  report.endingVisible = await page.evaluate(() => {
    const overlays = [...document.querySelectorAll('.overlay')];
    return overlays.some((overlay) => !overlay.hidden && overlay.textContent.includes('记忆已集齐'));
  });
  await shot('05-ending.png');
  report.steps.push('集齐 6 件物品并触发结局');
} catch (error) {
  report.fatal = String(error);
  await shot('99-error.png').catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
