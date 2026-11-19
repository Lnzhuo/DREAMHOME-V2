import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitToSize } from '../src/scene/loadModel.js';

test('旋转源网格的真实顶点贴地，居中并保持目标长度', () => {
  const model = new THREE.Group();
  model.position.set(1,2,3);
  const geometry = new THREE.BoxGeometry(1.8, .048, 2.4);
  geometry.rotateX(.67);
  const mesh = new THREE.Mesh(geometry);
  mesh.rotation.x = -.67;
  mesh.position.set(.2,.3,-.4);
  model.add(mesh);
  fitToSize(model, 2.4);
  const box = new THREE.Box3().setFromObject(model,true);
  const center = box.getCenter(new THREE.Vector3());
  assert(Math.abs(box.min.y)<1e-6);
  assert(Math.abs(center.x)+Math.abs(center.z)<1e-6);
  assert(Math.abs(box.max.z-box.min.z-2.4)<1e-6);
});
