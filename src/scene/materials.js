import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();

function loadTexture(url, colorSpace = THREE.NoColorSpace) {
  const texture = loader.load(url);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function getPBRMaterial(definition) {
  if (!definition) return null;
  const cacheKey = JSON.stringify(definition);
  if (cache.has(cacheKey)) return cache.get(cacheKey).clone();
  const parameters = {
    color: definition.baseColor || '#ffffff',
    roughness: definition.roughness ?? 1,
    metalness: definition.metalness ?? 0,
  };
  const maps = definition.maps || {};
  if (maps.baseColor?.url) parameters.map = loadTexture(maps.baseColor.url, THREE.SRGBColorSpace);
  if (maps.normalMap?.url) {
    parameters.normalMap = loadTexture(maps.normalMap.url);
    parameters.normalScale = new THREE.Vector2().setScalar(definition.normalStrength ?? 1);
  }
  if (maps.roughnessMap?.url) parameters.roughnessMap = loadTexture(maps.roughnessMap.url);
  if (maps.metalnessMap?.url) parameters.metalnessMap = loadTexture(maps.metalnessMap.url);
  if (maps.aoMap?.url) {
    parameters.aoMap = loadTexture(maps.aoMap.url);
    parameters.aoMapIntensity = definition.aoIntensity ?? 1;
  }
  if (definition.transmission > 0) { parameters.transmission = definition.transmission; parameters.ior = definition.ior || 1.5; parameters.thickness = definition.thickness ?? 0.02; }
  const material = definition.transmission > 0 ? new THREE.MeshPhysicalMaterial(parameters) : new THREE.MeshStandardMaterial(parameters);
  const repeat = definition.repeat || [1, 1];
  for (const texture of [parameters.map, parameters.normalMap, parameters.roughnessMap, parameters.metalnessMap, parameters.aoMap].filter(Boolean)) {
    texture.repeat.set(repeat[0], repeat[1]);
  }
  material.userData.definition = definition;
  cache.set(cacheKey, material);
  return material.clone();
}
