import * as THREE from 'three';
import { loadGlb } from '../scene/loadModel.js';

// Generate one thumbnail only on user import; the built-in catalog is pre-rendered.
export async function renderThumbnailDataUrl(url) {
  const model = await loadGlb(url);
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(512, 512); renderer.setPixelRatio(1); renderer.setClearColor(0xf3f0ea);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad9f, 2));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(3, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1); fill.position.set(-3, 2, -4); scene.add(fill);
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model, true), size = box.getSize(new THREE.Vector3()), max = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(max) || max <= 0) { renderer.dispose(); throw new Error('模型边界无效'); }
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const camera = new THREE.PerspectiveCamera(35, 1, max / 1000, max * 100);
  camera.position.set(max * 1.7, max * 1.2, max * 2); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); renderer.render(scene, camera);
  const result = renderer.domElement.toDataURL('image/png');
  model.traverse((part) => { part.geometry?.dispose(); for (const material of [].concat(part.material || [])) { for (const v of Object.values(material)) if (v?.isTexture) v.dispose(); material.dispose(); } });
  renderer.dispose(); return result;
}

export async function generateModelThumbnail(asset) {
  if (!asset.thumbnailUrl) asset.thumbnailUrl = await renderThumbnailDataUrl(asset.modelUrl);
  return asset.thumbnailUrl;
}
export async function ensureAssetThumbnails(assets, onProgress) {
  const results = [];
  for (const asset of assets.filter(a => !a.thumbnailUrl)) {
    try { const url = await generateModelThumbnail(asset); results.push({ id: asset.id, thumbnailUrl: url }); onProgress?.(asset, url); }
    catch (error) { results.push({ id: asset.id, error: error.message }); }
  }
  return results;
}

// Single user-imported asset: generate a transparent, aspect-correct top view.
export async function renderPlanDataUrl(url) {
  const model = await loadGlb(url), scene = new THREE.Scene();
  const box = new THREE.Box3().setFromObject(model, true), size = box.getSize(new THREE.Vector3());
  if (!size.x || !size.z || !Number.isFinite(size.x + size.z)) throw new Error('模型俯视边界无效');
  model.position.sub(box.getCenter(new THREE.Vector3())); scene.add(model);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c2b8, 2));
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(2, 5, 3); scene.add(key);
  const longest = Math.max(size.x, size.z), width = Math.max(1, Math.round(512 * size.x / longest)), height = Math.max(1, Math.round(512 * size.z / longest));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height); renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const camera = new THREE.OrthographicCamera(-size.x*.51, size.x*.51, size.z*.51, -size.z*.51, .001, Math.max(size.x,size.y,size.z)*20);
  camera.up.set(0,0,-1); camera.position.set(0,Math.max(size.x,size.y,size.z)*4,0); camera.lookAt(0,0,0); camera.updateProjectionMatrix(); renderer.render(scene,camera);
  const data = renderer.domElement.toDataURL('image/png');
  model.traverse((part) => { part.geometry?.dispose(); for (const material of [].concat(part.material || [])) { for (const v of Object.values(material)) if (v?.isTexture) v.dispose(); material.dispose(); } }); renderer.dispose();
  return { url: data, width, height, view: '+Y', up: '-Z', right: '+X', projection: 'orthographic' };
}
