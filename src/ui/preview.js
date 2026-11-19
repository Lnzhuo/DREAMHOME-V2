import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 记忆卡片里的「照片 → 3D」对照预览：克隆当前物品模型，支持拖动旋转。
export function createModelPreview(container, model) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight('#fff1dc', '#4a3527', 1.1));
  const key = new THREE.DirectionalLight('#ffe3bd', 1.8);
  key.position.set(2.5, 3.5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cdd8ff', 0.5);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  const clone = model.clone(true);
  const box = new THREE.Box3().setFromObject(clone, true);
  const dims = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(dims.x, dims.y, dims.z) || 1;
  clone.scale.multiplyScalar(1 / maxDim);
  const fitted = new THREE.Box3().setFromObject(clone);
  clone.position.sub(fitted.getCenter(new THREE.Vector3()));
  scene.add(clone);

  camera.position.set(1.5, 0.95, 1.9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.4;
  controls.minDistance = 1.2;
  controls.maxDistance = 4;
  controls.enablePan = false;
  controls.update();

  function resize() {
    const width = container.clientWidth || 280;
    const height = container.clientHeight || 200;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    dispose() {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
