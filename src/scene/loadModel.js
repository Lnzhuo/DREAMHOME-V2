import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Instances keep their own materials and transforms. Identical chairs in a
// furnished flat share GPU geometry and textures, including during a rebuild.
const resources = new Map();
const instances = new WeakMap();
const sharedGeometry = new WeakSet();

function releaseResource(url, entry) {
  if (entry.users || resources.get(url)!==entry || !entry.scene) return;
  resources.delete(url);
  const disposed = new Set();
  const dispose = value => { if (value && !disposed.has(value)) { disposed.add(value); value.dispose(); } };
  entry.scene.traverse(node => {
    if (!node.isMesh) return;
    dispose(node.geometry);
    for (const material of [node.material].flat()) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) dispose(value);
      dispose(material);
    }
  });
}

export async function loadGlb(url) {
  return (await loader.loadAsync(url)).scene;
}

export async function loadSharedGlb(url) {
  let entry=resources.get(url);
  if (!entry) {
    entry={users:0,scene:null,timer:null};
    entry.loading=loader.loadAsync(url).then(gltf=>entry.scene=gltf.scene);
    resources.set(url,entry);
  }
  entry.users++; clearTimeout(entry.timer);
  try {
    const instance=cloneSkeleton(await entry.loading);
    const materials=new Map();
    const copy=material=>{
      if (!materials.has(material)) materials.set(material,material.clone());
      return materials.get(material);
    };
    instance.traverse(node=>{
      if (!node.isMesh) return;
      sharedGeometry.add(node.geometry);
      node.material=Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
    });
    instances.set(instance,{url,entry,materials});
    return instance;
  } catch (error) {
    entry.users--;
    if (!entry.users && resources.get(url)===entry) resources.delete(url);
    throw error;
  }
}

export function disposeSceneGroup(group) {
  const disposeOnce=new Set();
  group.traverse(node=>{
    const owner=instances.get(node);
    if (owner) {
      instances.delete(node);
      for (const mat of owner.materials.values()) disposeOnce.add(mat);
      owner.entry.users--;
      if (!owner.entry.users) owner.entry.timer=setTimeout(()=>releaseResource(owner.url,owner.entry),1500);
    }
    if (!node.isMesh) return;
    if (!sharedGeometry.has(node.geometry)) disposeOnce.add(node.geometry);
    for (const mat of [node.material].flat()) if (mat) disposeOnce.add(mat);
  });
  for (const disposable of disposeOnce) disposable?.dispose();
}

// 统一模型尺寸：最长边缩放到 targetSize（米），底部对齐 y=0，水平居中。
// Lux3D 导出的 GLB 与占位几何体都经过这里，保证替换模型后位置不变。
export function fitToSize(model, targetSize) {
  const resource = instances.get(model)?.entry;
  const box = resource?.bounds || new THREE.Box3().setFromObject(model, true);
  if (resource) resource.bounds = box;
  const dims = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(dims.x, dims.y, dims.z) || 1;
  const factor = targetSize / maxDim;
  const anchor = box.getCenter(new THREE.Vector3());
  anchor.y = box.min.y;
  model.scale.multiplyScalar(factor);
  model.position.sub(anchor).multiplyScalar(factor);
  return model;
}
