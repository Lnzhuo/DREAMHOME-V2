import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTS } from '../src/data/objects.js';
import { createDemoSceneDocument } from '../src/data/demo-scene.js';
import { assertSceneDocument, validateSceneDocument } from '../src/data/scene-document.js';

function expectInvalid(sceneDocument, path) {
  const result = validateSceneDocument(sceneDocument);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) => error.path.includes(path)),
    `Expected an error at ${path}, received ${JSON.stringify(result.errors)}`,
  );
  return result;
}

test('demo SceneDocument is valid and assert returns the document', () => {
  const sceneDocument = createDemoSceneDocument();
  const result = validateSceneDocument(sceneDocument);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.equal(assertSceneDocument(sceneDocument), sceneDocument);
});

test('demo factory returns independent documents', () => {
  const first = createDemoSceneDocument();
  const second = createDemoSceneDocument();
  first.assets[0].name = 'changed';
  first.placements[0].position.x = 99;
  assert.notEqual(second.assets[0].name, 'changed');
  assert.notEqual(second.placements[0].position.x, 99);
});

test('demo assets and placements preserve current object data without claiming Lux3D', () => {
  const sceneDocument = createDemoSceneDocument();
  assert.equal(sceneDocument.assets.length, OBJECTS.length);
  assert.equal(sceneDocument.placements.length, OBJECTS.length);

  for (const item of OBJECTS) {
    const asset = sceneDocument.assets.find((entry) => entry.id === item.id);
    const placement = sceneDocument.placements.find((entry) => entry.assetId === item.id);
    assert.ok(asset, `Missing asset ${item.id}`);
    assert.ok(placement, `Missing placement ${item.id}`);
    assert.equal(asset.source, 'procedural');
    assert.equal(asset.modelUrl, null);
    assert.equal(asset.procedural.kind, item.placeholder);
    assert.equal(asset.procedural.color, item.color);
    assert.deepEqual(Object.values(placement.position), item.position);
    assert.equal(placement.rotation.y, item.rotationY);
    for (const dimension of Object.values(asset.dimensions)) {
      assert.equal(dimension.source, 'estimated');
      assert.equal(dimension.unit, 'm');
    }
    const maxDimension = Math.max(
      asset.dimensions.width.value,
      asset.dimensions.depth.value,
      asset.dimensions.height.value,
    );
    assert.ok(Math.abs(maxDimension - item.size) < 0.000001);
  }
});

test('coordinate system requires meters and Y-up', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.coordinateSystem.unit = 'cm';
  sceneDocument.coordinateSystem.upAxis = 'Z';
  expectInvalid(sceneDocument, 'coordinateSystem.unit');
  expectInvalid(sceneDocument, 'coordinateSystem.upAxis');
});

test('entity ids must be unique', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.assets[1].id = sceneDocument.assets[0].id;
  expectInvalid(sceneDocument, 'assets[1].id');
});

test('placements require existing assets and containers', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.placements[0].assetId = 'missing-asset';
  sceneDocument.placements[0].containerId = 'missing-room';
  expectInvalid(sceneDocument, 'placements[0].assetId');
  expectInvalid(sceneDocument, 'placements[0].containerId');
});

test('placement transforms reject non-finite positions and non-positive scale', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.placements[0].position.x = Number.NaN;
  sceneDocument.placements[0].scale.x = 0;
  expectInvalid(sceneDocument, 'placements[0].position.x');
  expectInvalid(sceneDocument, 'placements[0].scale.x');
});

test('Lux3D assets reject placeholder task ids', () => {
  const sceneDocument = createDemoSceneDocument();
  const asset = sceneDocument.assets[0];
  asset.source = 'lux3d_image';
  asset.provider = 'aholo-lux3d';
  asset.providerTaskId = 'REPLACE_WITH_REAL_TASK_ID';
  asset.modelUrl = '/assets/models/mug.glb';
  delete asset.procedural;
  expectInvalid(sceneDocument, 'assets[0].providerTaskId');
});

test('procedural assets cannot claim a GLB model URL', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.assets[0].modelUrl = '/assets/models/not-a-real-model.glb';
  expectInvalid(sceneDocument, 'assets[0].modelUrl');
});

test('unknown asset dimensions use null and estimated dimensions require numbers', () => {
  const validDocument = createDemoSceneDocument();
  validDocument.assets[0].dimensions.width = { value: null, unit: 'm', source: 'unknown' };
  assert.equal(validateSceneDocument(validDocument).valid, true);

  const invalidDocument = createDemoSceneDocument();
  invalidDocument.assets[0].dimensions.width = { value: 0.2, unit: 'm', source: 'unknown' };
  expectInvalid(invalidDocument, 'assets[0].dimensions.width.value');
});

test('openings must fit within their wall', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.buildings[0].floors[0].openings[0].offsetFromWallStart = 7.5;
  expectInvalid(sceneDocument, 'buildings[0].floors[0].openings[0]');
});

test('room projects contain exactly one room', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.buildings[0].floors[0].rooms = [];
  expectInvalid(sceneDocument, 'projectType');
});

test('assertSceneDocument exposes structured validation errors', () => {
  const sceneDocument = createDemoSceneDocument();
  sceneDocument.projectId = '';
  assert.throws(
    () => assertSceneDocument(sceneDocument),
    (error) => error.name === 'SceneDocumentValidationError' && error.errors[0].path === 'projectId',
  );
});
