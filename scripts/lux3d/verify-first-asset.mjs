import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const resultsFile = process.env.RESULTS_FILE || path.resolve('data', 'verification', 'lux3d-approved-results.json');
const evidence = process.env.EVIDENCE_DIR || path.resolve('data', 'verification');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173/';
await fs.mkdir(evidence, { recursive: true });
const results = JSON.parse(await fs.readFile(resultsFile, 'utf8'));
const requestedName = process.env.ASSET_NAME || '奶油色沙发';
const selected = results.find((entry) => entry.requestedName === requestedName);
assert.ok(selected, `未找到资产结果：${requestedName}`);
const job = selected.job;
const evidencePrefix = process.env.ASSET_PREFIX || 'lux3d-sofa';
assert.equal(job.status, 'succeeded');
const asset = job.outputAsset;
assert.equal(asset.source, 'lux3d_text');
assert.ok(asset.providerTaskId && !/REPLACE|PLACEHOLDER/i.test(asset.providerTaskId));
const modelPath = path.resolve('data', 'projects', 'final-demo', 'assets', asset.id, 'model.glb');
const bytes = await fs.readFile(modelPath);
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256, asset.archive.sha256);
asset.generation = { mode: 'text_to_3d', version: 'G1', faceCount: 60000, outputFormat: ['glb'], aiPredictSize: false };
asset.archive.relativePath = path.relative(process.cwd(), modelPath);
await fs.writeFile(path.join(path.dirname(modelPath), 'asset.json'), `${JSON.stringify(asset, null, 2)}\n`);

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const report = { taskId: asset.providerTaskId, prompt: asset.prompt, generation: asset.generation, archive: asset.archive, errors };
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__dreamhome), { timeout: 20000 });
  report.imported = await page.evaluate(async (luxAsset) => {
    const app = window.__dreamhome;
    const response = await fetch(luxAsset.modelUrl);
    if (!response.ok) throw new Error(` archived model HTTP ${response.status}`);
    const stored = await app.assetRepository.putAsset({ asset: luxAsset, blob: await response.blob() });
    await app.assetLibrary.refresh();
    return { id: stored.id, source: stored.source, modelUrl: stored.modelUrl, providerTaskId: stored.providerTaskId };
  }, asset);
  const card = page.locator('.dh-asset-card').filter({ hasText: asset.name });
  await card.locator('button').filter({ hasText: '放入房间' }).click();
  await page.waitForFunction((assetId) => {
    const app = window.__dreamhome;
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    return placement && app.game.placementGroups[placement.id]?.userData.hasRealModel;
  }, asset.id, { timeout: 30000 });
  await page.screenshot({ path: path.join(evidence, `${evidencePrefix}-in-room.png`) });

  report.model = await page.evaluate(async (assetId) => {
    const app = window.__dreamhome;
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    const group = app.game.placementGroups[placement.id];
    const THREE = await import('/node_modules/three/build/three.module.js');
    const box = new THREE.Box3().setFromObject(group.userData.content);
    const size = box.getSize(new THREE.Vector3());
    let meshes = 0;
    let standardMaterials = 0;
    let texturedMaterials = 0;
    let triangles = 0;
    group.userData.content.traverse((child) => {
      if (!child.isMesh) return;
      meshes += 1;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material.isMeshStandardMaterial) standardMaterials += 1;
        if (material.map) texturedMaterials += 1;
      }
      triangles += child.geometry.index ? child.geometry.index.count / 3 : child.geometry.attributes.position.count / 3;
    });
    return {
      placementId: placement.id,
      bottomY: box.min.y,
      width: size.x,
      depth: size.z,
      height: size.y,
      meshes,
      standardMaterials,
      texturedMaterials,
      triangles,
      source: app.game.sceneDocument.assets.find((entry) => entry.id === assetId).source,
    };
  }, asset.id);
  assert.ok(Math.abs(report.model.bottomY) < 0.002);
  assert.ok(report.model.meshes > 0);
  assert.ok(report.model.triangles > 0);
  assert.ok(report.model.standardMaterials > 0);

  const before = await page.evaluate((assetId) => {
    const app = window.__dreamhome;
    return app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId).position;
  }, asset.id);
  const point = await page.evaluate((assetId) => {
    const app = window.__dreamhome;
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    const vector = app.game.placementGroups[placement.id].position.clone();
    vector.y += 0.4;
    vector.project(app.game.camera);
    const rect = app.game.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((vector.x + 1) / 2) * rect.width, y: rect.top + ((1 - vector.y) / 2) * rect.height };
  }, asset.id);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 70, point.y - 10, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  report.edit = await page.evaluate((assetId) => {
    const app = window.__dreamhome;
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    return { position: placement.position, runtime: app.game.placementGroups[placement.id].position.toArray(), canUndo: app.editor.canUndo() };
  }, asset.id);
  assert.notDeepEqual(report.edit.position, before);
  assert.deepEqual(report.edit.runtime, Object.values(report.edit.position));
  assert.equal(report.edit.canUndo, true);
  await page.screenshot({ path: path.join(evidence, `${evidencePrefix}-edited.png`) });

  await page.evaluate(() => window.__dreamhome.saveProject({ snapshot: true }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__dreamhome), { timeout: 20000 });
  await page.waitForTimeout(2000);
  report.restored = await page.evaluate((assetId) => {
    const app = window.__dreamhome;
    const asset = app.game.sceneDocument.assets.find((entry) => entry.id === assetId);
    const placement = app.game.sceneDocument.placements.find((entry) => entry.assetId === assetId);
    const group = app.game.placementGroups[placement?.id];
    return {
      assetExists: Boolean(asset),
      placementExists: Boolean(placement),
      source: asset?.source,
      taskId: asset?.providerTaskId,
      hasRealModel: Boolean(group?.userData.hasRealModel),
      loadError: group?.userData.loadError,
      valid: app.game.validateScene().valid,
    };
  }, asset.id);
  assert.equal(report.restored.assetExists, true);
  assert.equal(report.restored.placementExists, true);
  assert.equal(report.restored.source, 'lux3d_text');
  assert.equal(report.restored.taskId, asset.providerTaskId);
  assert.equal(report.restored.hasRealModel, true);
  assert.equal(report.restored.loadError, undefined);
  assert.equal(report.restored.valid, true);
  await page.screenshot({ path: path.join(evidence, `${evidencePrefix}-restored.png`) });
  report.actualCredits = '预计 20 积分；实际扣费需以 Aholo 账户记录为准';
  report.fatal = null;
} catch (error) {
  report.fatal = String(error);
  await page.screenshot({ path: path.join(evidence, `${evidencePrefix}-validation-error.png`) }).catch(() => {});
}
await fs.writeFile(path.join(evidence, `${evidencePrefix}-validation.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.fatal) process.exitCode = 1;
