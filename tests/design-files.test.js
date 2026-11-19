import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'three/addons/libs/fflate.module.js';
import { buildDesignFile, readDesign } from '../src/storage/DesignFiles.js';
import { createDemoSceneDocument } from '../src/data/demo-scene.js';
import { createVillaDocument, VILLA_TEMPLATES } from '../src/data/v2-contracts.js';

const model = await fs.readFile(new URL('fixtures/upload-mug-test.glb', import.meta.url));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2xkAAAAASUVORK5CYII=', 'base64');
function repository() {
  const files = new Map();
  return {
    files,
    getAssetBlob: async id => files.get(id),
    async putAsset({asset,blob}) {
      files.set(asset.id,blob);
      return { ...asset, modelUrl:'idb://assets/' + asset.id + '/model.glb' };
    },
    async putReference(blob) { const id = crypto.randomUUID(); files.set(id,blob); return id; },
    async deleteAsset(id) { files.delete(id); }
  };
}
function uploadedScene() {
  const doc = createDemoSceneDocument();
  const sample = doc.assets[0];
  sample.source = 'user_upload';
  sample.modelUrl = 'idb://assets/' + sample.id + '/model.glb';
  delete sample.procedural;
  return doc;
}
const empty = { assets:[] };
const pack = entries => new Blob([zipSync(entries)]);
async function contents(file) { return unzipSync(new Uint8Array(await file.arrayBuffer())); }

test('旧版单客厅存档保持房间、家具和变换，用户模型重新分配本地 ID，凭据字段不进入分享', async () => {
  const doc = uploadedScene();
  doc.apiKey = 'synthetic-value';
  const repo = repository(), target = repository(), original = doc.assets[0].id;
  repo.files.set(original,new Blob([model]));
  const file = await buildDesignFile(doc,repo);
  const entries = await contents(file);
  assert.equal(JSON.parse(strFromU8(entries['scene.json'])).apiKey,undefined);
  const restored = await readDesign(file,target,empty);
  assert.deepEqual(restored.buildings,doc.buildings);
  assert.deepEqual(restored.placements[0].position,doc.placements[0].position);
  assert.notEqual(restored.assets[0].id,original);
  assert.equal(restored.assets[0].id,restored.placements[0].assetId);
  assert.deepEqual(Buffer.from(await target.files.get(restored.assets[0].id).arrayBuffer()),model);
});

test('生成于原服务器的 GLB 随设计导出，即使新服务器没有此任务也可导入', async t => {
  const doc = uploadedScene();
  doc.assets[0].modelUrl = '/api/assets/asset-abcdef/model.glb';
  const network = t.mock.method(globalThis, 'fetch', async () => new Response(model));
  const file = await buildDesignFile(doc,repository());
  network.mock.mockImplementation(() => { throw new Error('offline'); });
  const restored = await readDesign(file,repository(),empty);
  assert.match(restored.assets[0].modelUrl,/^idb:/);
  assert.equal(network.mock.callCount(),1);
});

test('旧分享中的服务器模型可从原站恢复，失效时不导入残缺模型', async t => {
  const doc = uploadedScene();
  doc.assets[0].modelUrl = '/api/assets/asset-abcdef/model.glb';
  const file = pack({'scene.json':strToU8(JSON.stringify(doc))});
  const network = t.mock.method(globalThis,'fetch',async () => new Response(model));
  assert.match((await readDesign(file,repository(),empty)).assets[0].modelUrl,/^idb:/);
  network.mock.mockImplementation(async () => new Response('',{status:404}));
  await assert.rejects(readDesign(file,repository(),empty),/无法读取/);
});

test('别墅每层参考图及校准比例独立跨资料库恢复，损坏分享不会留下部分导入', async () => {
  const doc = createVillaDocument(VILLA_TEMPLATES[1]), repo = repository(), target = repository();
  const ref = id => ({ blobId:id, type:'image/png', name:id+'.png', width:9, ratio:1 });
  doc.referencePlan = ref('first');
  doc.referencePlans = {'floor-2': {...ref('second'),width:12}};
  for (const id of ['first','second']) repo.files.set(id,new Blob([png]));
  const file = await buildDesignFile(doc,repo);
  const restored = await readDesign(file,target,empty);
  assert.equal(restored.referencePlan.width,9);
  assert.equal(restored.referencePlans['floor-2'].width,12);
  assert.equal(target.files.size,2);
  for (const {blobId} of [restored.referencePlan,restored.referencePlans['floor-2']])
    assert.deepEqual(Buffer.from(await target.files.get(blobId).arrayBuffer()),png);
  const broken = await contents(file);
  delete broken['references/floor-2'];
  await assert.rejects(readDesign(pack(broken),target,empty),/参考图/);
  assert.equal(target.files.size,2);
  const failing = repository();
  const save = failing.putReference;
  failing.putReference = async blob => { if(failing.files.size) throw new Error('模拟存储容量不足'); return save(blob); };
  await assert.rejects(readDesign(file,failing,empty),/模拟存储容量不足/);
  assert.equal(failing.files.size,0);
});
test('分享拒收缺少可编辑房间的文件，旧项目不受影响', async () => {
  const doc = createVillaDocument(VILLA_TEMPLATES[0]);
  doc.buildings = [];
  const file = pack({'scene.json':strToU8(JSON.stringify(doc))});
  const target = repository();
  await assert.rejects(readDesign(file,target,empty),/缺少可编辑/);
  assert.equal(target.files.size,0);
});
