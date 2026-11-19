import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = process.env.EVIDENCE_DIR || path.resolve(ROOT, '..', 'shots', 'phase-02');
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
const glbRequests = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push({ text: message.text(), location: message.location() });
});
page.on('request', (request) => {
  if (/\.glb(?:\?|$)/i.test(request.url())) glbRequests.push(request.url());
});

const report = { pageErrors, consoleErrors, glbRequests };
const shot = (name) => page.screenshot({ path: path.join(EVIDENCE, name) });
const closeTo = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__memoryHunt), { timeout: 20000 });
  await page.waitForTimeout(1000);

  report.initial = await page.evaluate(() => {
    const { game, objects, sceneDocument } = window.__memoryHunt;
    const transformsMatch = sceneDocument.placements.every((placement) => {
      const group = game.placementGroups[placement.id];
      return group &&
        group.position.x === placement.position.x && group.position.y === placement.position.y && group.position.z === placement.position.z &&
        group.rotation.x === placement.rotation.x && group.rotation.y === placement.rotation.y && group.rotation.z === placement.rotation.z &&
        group.scale.x === placement.scale.x && group.scale.y === placement.scale.y && group.scale.z === placement.scale.z;
    });
    return {
      valid: game.validateScene().valid,
      assets: sceneDocument.assets.length,
      placements: sceneDocument.placements.length,
      views: objects.length,
      runtimeGroups: Object.keys(game.placementGroups).length,
      stableAlias: game.objectGroups.mug === game.getObjectGroup('mug'),
      stableIds: sceneDocument.placements.map((entry) => entry.id),
      sources: sceneDocument.assets.map((entry) => entry.source),
      transformsMatch,
      floorWidth: game.roomGroup.getObjectByName('floor:floor-memory').geometry.parameters.width,
    };
  });
  assert.equal(report.initial.valid, true);
  assert.equal(report.initial.assets, 6);
  assert.equal(report.initial.placements, 6);
  assert.equal(report.initial.views, 6);
  assert.equal(report.initial.runtimeGroups, 6);
  assert.equal(report.initial.stableAlias, true);
  assert.equal(report.initial.transformsMatch, true);
  assert.ok(report.initial.sources.every((source) => source === 'procedural'));
  closeTo(report.initial.floorWidth, 20, 'default parameterized floor');

  await page.click('#start-btn');
  await page.waitForTimeout(400);
  await shot('01-scene-document-room.png');

  report.dataToScene = await page.evaluate(() => {
    const { game } = window.__memoryHunt;
    const before = game.getObjectGroup('mug').position.toArray();
    const placement = game.updatePlacementTransform('placement-mug', {
      position: { x: -0.65, y: 0.86, z: -1.75 },
      rotation: { y: 0.8 },
      scale: { x: 1.1, y: 1.1, z: 1.1 },
    });
    const group = game.getObjectGroup('mug');
    return {
      before,
      documentPosition: placement.position,
      runtimePosition: group.position.toArray(),
      runtimeRotationY: group.rotation.y,
      runtimeScale: group.scale.toArray(),
    };
  });
  assert.deepEqual(report.dataToScene.runtimePosition, [-0.65, 0.86, -1.75]);
  closeTo(report.dataToScene.runtimeRotationY, 0.8, 'data to scene rotation');
  assert.ok(report.dataToScene.runtimeScale.every((value) => Math.abs(value - 1.1) < 1e-6));
  await page.waitForTimeout(250);
  await shot('02-data-to-scene.png');

  report.sceneToData = await page.evaluate(() => {
    const { game } = window.__memoryHunt;
    const group = game.getObjectGroup('mug');
    group.position.set(-0.4, 0.86, -1.5);
    group.rotation.y = 1.1;
    group.scale.set(1.2, 1.2, 1.2);
    const placement = game.syncPlacementFromRuntime('placement-mug');
    return { placement, valid: game.validateScene().valid };
  });
  assert.deepEqual(report.sceneToData.placement.position, { x: -0.4, y: 0.86, z: -1.5 });
  closeTo(report.sceneToData.placement.rotation.y, 1.1, 'scene to data rotation');
  assert.equal(report.sceneToData.valid, true);

  report.interfaces = await page.evaluate(async () => {
    const { game } = window.__memoryHunt;
    const copy = structuredClone(game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug'));
    copy.id = 'placement-mug-copy';
    copy.position = { x: 0, y: 0, z: 0 };
    game.addPlacement(copy);
    const afterAdd = { count: game.sceneDocument.placements.length, runtimeExists: Boolean(game.placementGroups[copy.id]) };
    game.removePlacement(copy.id);
    const afterRemove = { count: game.sceneDocument.placements.length, runtimeExists: Boolean(game.placementGroups[copy.id]) };
    const model = await game.loadAsset('mug');
    let meshCount = 0;
    model.traverse((child) => {
      if (child.isMesh) meshCount += 1;
    });
    game.disposeRuntimeGroup(model);
    game.rebuildScene();
    const mug = game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug');
    const runtimeMug = game.getObjectGroup('mug');
    return {
      afterAdd,
      afterRemove,
      meshCount,
      valid: game.validateScene().valid,
      rebuildCount: Object.keys(game.placementGroups).length,
      reverseSyncPreserved: runtimeMug.position.x === mug.position.x && runtimeMug.rotation.y === mug.rotation.y,
    };
  });
  assert.deepEqual(report.interfaces.afterAdd, { count: 7, runtimeExists: true });
  assert.deepEqual(report.interfaces.afterRemove, { count: 6, runtimeExists: false });
  assert.ok(report.interfaces.meshCount > 0);
  assert.equal(report.interfaces.rebuildCount, 6);
  assert.equal(report.interfaces.reverseSyncPreserved, true);

  report.roomUpdate = await page.evaluate(() => {
    const { game } = window.__memoryHunt;
    const getMugPosition = () => game.sceneDocument.placements.find((entry) => entry.id === 'placement-mug').position;
    const beforeMug = structuredClone(getMugPosition());
    game.updateRoomDimensions('room-memory', { width: 10, depth: 8, height: 3.2 }, 'measured');
    const room = game.sceneDocument.buildings[0].floors[0].rooms[0];
    const floor = game.sceneDocument.buildings[0].floors[0];
    const xs = room.boundary.map((point) => point.x);
    const ys = room.boundary.map((point) => point.y);
    return {
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...ys) - Math.min(...ys),
      height: room.ceilingHeight.value,
      source: room.ceilingHeight.source,
      floorMeshWidth: game.roomGroup.getObjectByName('floor:floor-memory').geometry.parameters.width,
      openingOffset: floor.openings[0].offsetFromWallStart,
      placements: Object.keys(game.placementGroups).length,
      mugUnchanged: JSON.stringify(getMugPosition()) === JSON.stringify(beforeMug),
      valid: game.validateScene().valid,
    };
  });
  assert.equal(report.roomUpdate.width, 10);
  assert.equal(report.roomUpdate.depth, 8);
  assert.equal(report.roomUpdate.height, 3.2);
  assert.equal(report.roomUpdate.source, 'measured');
  assert.equal(report.roomUpdate.floorMeshWidth, 25);
  closeTo(report.roomUpdate.openingOffset, 4.93 * 1.25, 'opening scaled with wall');
  assert.equal(report.roomUpdate.placements, 6);
  assert.equal(report.roomUpdate.mugUnchanged, true);
  await page.waitForTimeout(300);
  await shot('03-room-resized.png');

  await page.evaluate(() => {
    const { game } = window.__memoryHunt;
    game.updateRoomDimensions('room-memory', { width: 8, depth: 6, height: 3 }, 'estimated');
    game.updatePlacementTransform('placement-mug', {
      position: { x: -1.05, y: 0.86, z: -2.05 },
      rotation: { x: 0, y: 0.4, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
  });
  await page.waitForTimeout(300);
  const beforeDrag = await page.evaluate(() => window.__memoryHunt.game.camera.position.toArray());
  await page.mouse.move(940, 430);
  await page.mouse.down();
  await page.mouse.move(1060, 475, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterDrag = await page.evaluate(() => window.__memoryHunt.game.camera.position.toArray());
  report.cameraMoved = beforeDrag.some((value, index) => Math.abs(value - afterDrag[index]) > 0.001);
  assert.equal(report.cameraMoved, true);

  const point = await page.evaluate(() => {
    const { game } = window.__memoryHunt;
    const vector = game.getObjectGroup('mug').position.clone();
    vector.y += 0.1;
    vector.project(game.camera);
    const rect = game.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - vector.y) / 2) * rect.height,
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(900);
  report.canvasPick = await page.evaluate(
    () => document.querySelector('.overlay:not([hidden]) .card h3')?.textContent || null,
  );
  assert.equal(report.canvasPick, '缺口马克杯');
  await shot('04-original-interaction.png');
  await page.click('.overlay:not([hidden]) .primary-btn');
  await page.waitForTimeout(300);
  report.foundCount = await page.textContent('#found-count');
  assert.equal(report.foundCount, '1');

  report.final = await page.evaluate(() => ({
    valid: window.__memoryHunt.game.validateScene().valid,
    placements: window.__memoryHunt.game.sceneDocument.placements.length,
    realModels: Object.values(window.__memoryHunt.game.placementGroups).filter((group) => group.userData.hasRealModel).length,
  }));
  assert.equal(report.final.valid, true);
  assert.equal(report.final.placements, 6);
  assert.equal(report.final.realModels, 0);
} catch (error) {
  report.fatal = String(error);
  await shot('99-error.png').catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
await fs.writeFile(path.join(EVIDENCE, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (report.fatal) process.exitCode = 1;
