import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = process.env.EVIDENCE_DIR || path.resolve(ROOT, '..', 'shots', 'phase-03');
const BASE = process.env.DEMO_URL || 'http://127.0.0.1:4173/';
await fs.mkdir(EVIDENCE, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
});
const realLuxAssets = process.env.REAL_ASSETS_FILE
  ? JSON.parse(await fs.readFile(process.env.REAL_ASSETS_FILE, 'utf8')).filter((entry) => entry.job?.status === 'succeeded')
  : [];
const report = { pageErrors, consoleErrors, realLux3dAssets: realLuxAssets.length, realLux3dTaskIds: realLuxAssets.map((entry) => entry.job.providerTaskId), realLlmCalls: 0, notes: ['GLB fixture is procedural user_upload, not Lux3D', 'SceneCommand plan is a test fixture, not an LLM result'] };
const shot = (name) => page.screenshot({ path: path.join(EVIDENCE, name), fullPage: true });

try {
  const health = await (await page.request.get(`${BASE}api/health`)).json();
  report.health = health;
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__dreamhome), { timeout: 20000 });
  await page.waitForTimeout(800);
  report.initial = await page.evaluate(() => ({
    projectId: window.__dreamhome.game.sceneDocument.projectId,
    assets: window.__dreamhome.game.sceneDocument.assets.length,
    placements: window.__dreamhome.game.sceneDocument.placements.length,
    room: window.__dreamhome.game.sceneDocument.buildings[0].floors[0].rooms[0].name,
    roomWidth: Math.max(...window.__dreamhome.game.sceneDocument.buildings[0].floors[0].rooms[0].boundary.map((point) => point.x)) - Math.min(...window.__dreamhome.game.sceneDocument.buildings[0].floors[0].rooms[0].boundary.map((point) => point.x)),
    roomDepth: Math.max(...window.__dreamhome.game.sceneDocument.buildings[0].floors[0].rooms[0].boundary.map((point) => point.y)) - Math.min(...window.__dreamhome.game.sceneDocument.buildings[0].floors[0].rooms[0].boundary.map((point) => point.y)),
    valid: window.__dreamhome.game.validateScene().valid,
  }));
  assert.equal(report.initial.placements, 6);
  assert.equal(report.initial.valid, true);
  assert.equal(report.initial.roomWidth, 5.2);
  assert.equal(report.initial.roomDepth, 4.8);
  await shot('01-product-editor.png');

  await page.locator('[data-view="2d"]').click();
  assert.equal(await page.locator('.dh-furniture-footprint').count(), 6);
  const mugFootprint = page.locator('[data-placement-id="placement-mug"]');
  const footprintBox = await mugFootprint.boundingBox();
  assert.ok(footprintBox);
  const before2d = await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').position);
  await page.mouse.move(footprintBox.x + footprintBox.width / 2, footprintBox.y + footprintBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(footprintBox.x + footprintBox.width / 2 + 35, footprintBox.y + footprintBox.height / 2 + 15, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  report.floorplan = await page.evaluate(() => ({
    selection: window.__dreamhome.editor.selectedId,
    placement: window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug'),
    runtime: window.__dreamhome.game.getObjectGroup('mug').position.toArray(),
    dimensionLabels: document.querySelector('.dh-floorplan').textContent,
  }));
  assert.equal(report.floorplan.selection, 'placement-mug');
  assert.notDeepEqual(report.floorplan.placement.position, before2d);
  assert.deepEqual(report.floorplan.runtime, Object.values(report.floorplan.placement.position));
  assert.ok(report.floorplan.dimensionLabels.includes('5.20 m'));
  assert.ok(report.floorplan.dimensionLabels.includes('4.80 m'));
  await shot('02-floorplan.png');
  await page.locator('[data-view="3d"]').click();

  await page.locator('.dh-space-item').filter({ hasText: '缺口马克杯' }).last().click();
  assert.equal(await page.evaluate(() => window.__dreamhome.editor.selectedId), 'placement-mug');
  assert.equal(await page.locator('.dh-property-name').textContent(), '缺口马克杯');
  await shot('02-selection.png');

  const point = await page.evaluate(() => {
    const { game } = window.__dreamhome;
    const vector = game.getObjectGroup('mug').position.clone();
    vector.y += 0.1;
    vector.project(game.camera);
    const rect = game.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((vector.x + 1) / 2) * rect.width, y: rect.top + ((1 - vector.y) / 2) * rect.height };
  });
  const beforeDrag = await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').position);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  report.mouseTransform = await page.evaluate(() => ({
    placement: window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug'),
    runtime: window.__dreamhome.game.getObjectGroup('mug').position.toArray(),
    canUndo: window.__dreamhome.editor.canUndo(),
  }));
  assert.notDeepEqual(report.mouseTransform.placement.position, beforeDrag);
  assert.deepEqual(report.mouseTransform.runtime, Object.values(report.mouseTransform.placement.position));
  assert.equal(report.mouseTransform.canUndo, true);
  await shot('03-mouse-transform.png');

  await page.locator('[data-mode="rotate"]').click();
  assert.equal(await page.evaluate(() => window.__dreamhome.editor.mode), 'rotate');
  await page.locator('[data-mode="scale"]').click();
  assert.equal(await page.evaluate(() => window.__dreamhome.editor.mode), 'scale');
  await page.locator('[data-action="snap"]').uncheck();
  assert.equal(await page.evaluate(() => window.__dreamhome.editor.snap), false);
  await page.locator('[data-action="snap"]').check();

  const beforeRotation = await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').rotation.y);
  await page.locator('[data-field="rotation"]').fill('45');
  await page.locator('[data-field="rotation"]').press('Tab');
  assert.ok(Math.abs(await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').rotation.y) - Math.PI / 4) < 1e-6);
  await page.locator('[data-action="undo"]').first().click();
  assert.ok(Math.abs(await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').rotation.y) - beforeRotation) < 1e-6);
  await page.locator('[data-action="redo"]').first().click();
  assert.ok(Math.abs(await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').rotation.y) - Math.PI / 4) < 1e-6);
  report.undoRedo = true;

  await page.locator('.dh-toolbar [data-action="delete"]').click();
  assert.equal(await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.length), 5);
  await page.locator('[data-action="undo"]').first().click();
  assert.equal(await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.length), 6);
  report.deleteUndo = true;

  await page.locator('.dh-space-item').filter({ hasText: '缺口马克杯' }).last().click();
  await page.locator('[data-field="replace"]').selectOption('lamp');
  assert.equal(await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').assetId), 'lamp');
  await page.locator('[data-action="undo"]').first().click();
  assert.equal(await page.evaluate(() => window.__dreamhome.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').assetId), 'mug');
  report.replaceUndo = true;

  await page.locator('[data-field="color"]').evaluate((input) => {
    input.value = '#aabbcc';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => window.__dreamhome.game.sceneDocument.assets.find((entry) => entry.id === 'mug').appearance.color), '#aabbcc');
  await page.locator('[data-action="undo"]').first().click();
  report.colorUndo = true;

  await page.locator('[data-action="glb"]').setInputFiles(path.join(ROOT, 'tests', 'fixtures', 'upload-mug-test.glb'));
  await page.waitForFunction(() => document.querySelector('.dh-upload-state').textContent.includes('已导入'), { timeout: 20000 });
  const card = page.locator('.dh-asset-card').filter({ hasText: 'upload-mug-test' });
  await card.locator('button').filter({ hasText: '放入房间' }).click();
  await page.waitForFunction(() => {
    const app = window.__dreamhome;
    return app.game.getObjectGroup(app.editor.selectedId)?.userData.hasRealModel;
  }, { timeout: 20000 });
  report.glbImport = await page.evaluate(() => {
    const app = window.__dreamhome;
    const placement = app.game.sceneDocument.placements.find((entry) => entry.id === app.editor.selectedId);
    const asset = app.game.sceneDocument.assets.find((entry) => entry.id === placement.assetId);
    return { assetId: asset.id, source: asset.source, modelUrl: asset.modelUrl, placementId: placement.id, dimensions: asset.dimensions };
  });
  assert.equal(report.glbImport.source, 'user_upload');
  assert.ok(report.glbImport.modelUrl.startsWith('idb://assets/'));
  assert.ok(Object.values(report.glbImport.dimensions).every((dimension) => dimension.source === 'estimated'));
  await shot('04-glb-imported.png');

  if (!health.llmConfigured) {
    await page.locator('.dh-ai-input-row input').fill('把马克杯向左移动30厘米');
    await page.locator('.dh-ai-input-row button').click();
    await page.waitForFunction(() => document.querySelector('.dh-ai-messages').textContent.includes('真实 AI 服务未配置'));
    report.aiUnavailableVisible = true;
    await shot('05-ai-unavailable.png');
  } else {
    report.aiUnavailableVisible = 'skipped: real LLM is configured; no paid request sent';
  }

  report.commandPipeline = await page.evaluate(() => {
    const app = window.__dreamhome;
    const before = structuredClone(app.game.sceneDocument);
    const plan = {
      summary: '自动化命令测试（非 LLM 结果）',
      commands: [{ type: 'move_asset', placementId: 'placement-mug', position: { x: -0.8, y: 0.86, z: -2.05 } }],
      questions: [], warnings: ['test fixture'], requiresConfirmation: true,
    };
    const preview = app.executor.preview(plan);
    const previewUnchanged = JSON.stringify(before) === JSON.stringify(app.game.sceneDocument);
    app.executor.apply(plan);
    const appliedX = app.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').position.x;
    app.executor.undo();
    const restoredX = app.game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').position.x;
    return { canApply: preview.canApply, previewUnchanged, appliedX, restoredX };
  });
  assert.equal(report.commandPipeline.canApply, true);
  assert.equal(report.commandPipeline.previewUnchanged, true);
  assert.equal(report.commandPipeline.appliedX, -0.8);

  await page.locator('[data-action="save"]').click();
  await page.waitForFunction(() => document.querySelector('.dh-save-state').textContent.includes('快照'));
  report.saved = await page.evaluate(async ({ projectId, assetId }) => {
    const app = window.__dreamhome;
    const projects = await app.projectRepository.listProjects();
    const snapshots = await app.projectRepository.listSnapshots(projectId);
    const blob = await app.assetRepository.getAssetBlob(assetId);
    return { projects: projects.length, snapshots: snapshots.length, projectId: app.game.sceneDocument.projectId, blobAvailable: Boolean(blob), blobBytes: blob?.size };
  }, { projectId: report.initial.projectId, assetId: report.glbImport.assetId });
  assert.ok(report.saved.projects >= 1);
  assert.ok(report.saved.snapshots >= 1);
  assert.equal(report.saved.blobAvailable, true);
  assert.ok(report.saved.blobBytes > 0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__dreamhome), { timeout: 20000 });
  await page.waitForTimeout(1800);
  report.restored = await page.evaluate((assetId) => {
    const app = window.__dreamhome;
    const asset = app.game.sceneDocument.assets.find((entry) => entry.id === assetId);
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    const group = app.game.placementGroups[placement?.id];
    return {
      projectId: app.game.sceneDocument.projectId,
      assetExists: Boolean(asset),
      placementExists: Boolean(placement),
      hasRealModel: Boolean(group?.userData.hasRealModel),
      loadError: group?.userData.loadError,
      valid: app.game.validateScene().valid,
    };
  }, report.glbImport.assetId);
  assert.equal(report.restored.projectId, report.initial.projectId);
  assert.equal(report.restored.assetExists, true);
  assert.equal(report.restored.placementExists, true);
  assert.equal(report.restored.hasRealModel, true);
  assert.equal(report.restored.loadError, undefined);
  assert.equal(report.restored.valid, true);
  await shot('06-project-restored.png');

  report.projectDeletion = await page.evaluate(async () => {
    const app = window.__dreamhome;
    const demo = structuredClone(app.game.sceneDocument);
    const created = await app.projectRepository.createProject({ name: '删除测试项目', sceneDocument: demo });
    await app.projectRepository.deleteProject(created.projectId);
    const projects = await app.projectRepository.listProjects();
    return { deleted: !projects.some((project) => project.projectId === created.projectId) };
  });
  assert.equal(report.projectDeletion.deleted, true);

  if (!health.lux3dConfigured && !health.lux3dPaidGenerationAllowed) {
    const response = await page.request.post(`${BASE}api/lux3d/text`, {
      data: { prompt: '测试，不创建任务', name: '测试', dimensions: { width: { value: 1, unit: 'm', source: 'estimated' } } },
    });
    report.lux3dBlockedStatus = response.status();
    assert.equal(response.status(), 503);
  } else {
    report.lux3dBlockedStatus = 'skipped: credentials or paid generation is configured';
  }
  report.fatal = null;
} catch (error) {
  report.fatal = String(error);
  await shot('99-error.png').catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
await fs.writeFile(path.join(EVIDENCE, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (report.fatal) process.exitCode = 1;
