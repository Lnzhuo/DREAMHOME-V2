import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorBridge } from '../src/editor/EditorBridge.js';

test('同一预设的不同饰面各自保存，重复应用同一饰面复用定义', () => {
  const original={id:'oak',baseColor:'#ffffff',roughness:.8,metalness:0,repeat:[2,2]};
  const document={materials:[structuredClone(original)]};
  const save=m=>EditorBridge.prototype.storeMaterial(document,m);
  const edited={...original,presetId:'oak',roughness:.35,metalness:.12};
  const id=save(edited);
  assert.notEqual(id,original.id);
  assert.equal(save({...edited}),id);
  assert.equal(save(original),original.id);
  assert.equal(document.materials[0].roughness,.8);
  assert.equal(document.materials.length,2);
});
