import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSceneDocument } from '../src/data/demo-scene.js';
import { OBJECTS, applyLegacyManifest, deriveObjectViews } from '../src/data/objects.js';
import {
  addPlacement,
  getRoomBounds,
  removePlacement,
  updatePlacementTransform,
  updateRoomDimensions,
} from '../src/data/scene-operations.js';
import { validateSceneDocument } from '../src/data/scene-document.js';

const EXPECTED_LAYOUT = {
  mug: { position: [-0.6825, 0.86, -1.64], rotationY: 0.4, size: 0.26, placeholder: 'mug' },
  lamp: { position: [-1.4625, 0.86, -1.84], rotationY: -0.3, size: 0.62, placeholder: 'lamp' },
  book: { position: [-2.288, 1.27, -0.68], rotationY: 1.35, size: 0.34, placeholder: 'book' },
  plant: { position: [1.0075, 1.06, -2.096], rotationY: 0, size: 0.52, placeholder: 'plant' },
  plush: { position: [1.5925, 0.68, 0.12], rotationY: -0.6, size: 0.46, placeholder: 'plush' },
  sneaker: { position: [0.975, 0.03, 1.4], rotationY: 0.8, size: 0.36, placeholder: 'sneaker' },
};

test('legacy OBJECTS is derived from SceneDocument and preserves stable layout', () => {
  assert.deepEqual(OBJECTS.map((entry) => entry.id), Object.keys(EXPECTED_LAYOUT));
  for (const view of OBJECTS) {
    const expected = EXPECTED_LAYOUT[view.id];
    assert.deepEqual(view.position, expected.position);
    assert.equal(view.rotationY, expected.rotationY);
    assert.equal(view.size, expected.size);
    assert.equal(view.placeholder, expected.placeholder);
    assert.equal(view.placementId, `placement-${view.id}`);
  }
  assert.deepEqual(deriveObjectViews(createDemoSceneDocument()), OBJECTS);
});

test('legacy manifest migration keeps model provenance honest', () => {
  const sceneDocument = applyLegacyManifest(createDemoSceneDocument(), { mug: 'mug.glb' });
  const mug = sceneDocument.assets.find((entry) => entry.id === 'mug');
  assert.equal(mug.source, 'user_upload');
  assert.equal(mug.modelUrl, 'assets/models/mug.glb');
  assert.equal(mug.provenanceStatus, 'legacy_manifest_unverified');
  assert.equal(mug.providerTaskId, undefined);
  assert.equal(validateSceneDocument(sceneDocument).valid, true);
});

test('addPlacement supports repeated assets with stable placement ids', () => {
  const original = createDemoSceneDocument();
  const copy = structuredClone(original.placements[0]);
  copy.id = 'placement-mug-copy';
  copy.position.x = 0;
  const next = addPlacement(original, copy);
  assert.equal(next.placements.length, original.placements.length + 1);
  assert.equal(next.assets.length, original.assets.length);
  assert.equal(next.placements.at(-1).id, 'placement-mug-copy');
  assert.equal(original.placements.length, 6);
});

test('removePlacement removes runtime data but retains the reusable asset', () => {
  const original = createDemoSceneDocument();
  const next = removePlacement(original, 'placement-mug');
  assert.equal(next.placements.some((entry) => entry.id === 'placement-mug'), false);
  assert.equal(next.assets.some((entry) => entry.id === 'mug'), true);
  assert.equal(original.placements.length, 6);
});

test('updatePlacementTransform is immutable and preserves unspecified components', () => {
  const original = createDemoSceneDocument();
  const next = updatePlacementTransform(original, 'placement-mug', {
    position: { x: 1.25 },
    rotation: { y: 1.5 },
    scale: { x: 2, y: 2, z: 2 },
  });
  const mug = next.placements.find((entry) => entry.id === 'placement-mug');
  assert.deepEqual(mug.position, { x: 1.25, y: 0.86, z: -1.64 });
  assert.equal(mug.rotation.y, 1.5);
  assert.deepEqual(mug.scale, { x: 2, y: 2, z: 2 });
  assert.equal(original.placements[0].position.x, -0.6825);
});

test('invalid transform is rejected without mutating the last valid document', () => {
  const original = createDemoSceneDocument();
  assert.throws(() => updatePlacementTransform(original, 'placement-mug', { scale: { x: 0 } }));
  assert.equal(original.placements[0].scale.x, 1);
  assert.equal(validateSceneDocument(original).valid, true);
});

test('room dimension updates parameterize boundaries, walls and openings', () => {
  const original = createDemoSceneDocument();
  const originalMug = original.placements[0].position;
  const next = updateRoomDimensions(original, 'room-memory', { width: 10, depth: 8, height: 3.2 }, 'measured');
  const room = next.buildings[0].floors[0].rooms[0];
  const floor = next.buildings[0].floors[0];
  const bounds = getRoomBounds(room);
  assert.equal(bounds.width, 10);
  assert.equal(bounds.depth, 8);
  assert.equal(room.ceilingHeight.value, 3.2);
  assert.equal(room.ceilingHeight.source, 'measured');
  assert.equal(floor.walls[0].height.value, 3.2);
  assert.equal(Math.hypot(floor.walls[0].end.x - floor.walls[0].start.x, 0), 10);
  assert.equal(Math.hypot(0, floor.walls[1].end.y - floor.walls[1].start.y), 8);
  assert.ok(Math.abs(floor.openings[0].offsetFromWallStart - 3.2045 * (10 / 5.2)) < 1e-8);
  assert.deepEqual(next.placements[0].position, originalMug);
  assert.equal(getRoomBounds(original.buildings[0].floors[0].rooms[0]).width, 5.2);
});

test('invalid room height is rejected without changing the scene', () => {
  const original = createDemoSceneDocument();
  assert.throws(() => updateRoomDimensions(original, 'room-memory', { width: 8, depth: 6, height: 2.4 }));
  assert.equal(original.buildings[0].floors[0].rooms[0].ceilingHeight.value, 3);
});
