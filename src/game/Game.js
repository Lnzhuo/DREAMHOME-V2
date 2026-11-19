import * as THREE from 'three';
import { walkStep, walkSiteStep } from '../scene/walk.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBuilding } from '../scene/createBuilding.js';
import { getPBRMaterial } from '../scene/materials.js';
import { createPlaceholder } from '../scene/placeholders.js';
import { loadSharedGlb, fitToSize, disposeSceneGroup } from '../scene/loadModel.js';
import { deriveObjectViews, getAssetSize } from '../data/objects.js';
import { assertSceneDocument, validateSceneDocument } from '../data/scene-document.js';
import {
  addPlacement as addPlacementToDocument,
  removePlacement as removePlacementFromDocument,
  updatePlacementTransform as updatePlacementTransformInDocument,
  updateRoomDimensions as updateRoomDimensionsInDocument,
  getRoomBounds, findRoomContext,
} from '../data/scene-operations.js';

const INITIAL_CAMERA = new THREE.Vector3(0.4, 2.7, 6.8);
const INITIAL_TARGET = new THREE.Vector3(0, 1.05, -0.3);
const BG_START = new THREE.Color('#ecebe8');
const BG_END = new THREE.Color('#2a1d12');

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class Game {
  constructor(container, sceneDocument, { assetUrlResolver = null } = {}) {
    this.container = container;
    this.sceneDocument = assertSceneDocument(structuredClone(sceneDocument));
    this.assetUrlResolver = assetUrlResolver;
    this.activeRoomId = this.sceneDocument.buildings[0]?.floors[0]?.rooms[0]?.id || null;
    this.objects = [];
    this.objectGroups = {};
    this.placementGroups = {};
    this.pickables = [];
    this.found = new Set();
    this.syncObjectViews();
    this.onObjectClick = null;
    this.onModelLoaded = null;

    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
    this.tween = null;
    this.ending = null;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = BG_START.clone();
    this.scene.fog = new THREE.Fog(BG_START.clone(), 45, 92);

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.05, 100);
    this.camera.position.copy(INITIAL_CAMERA);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.domElement.style.cursor = 'grab';
    new HDRLoader().load('/api/library/hdris/white_home_studio_2k.hdr', (environment) => {
      environment.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = environment;
      this.needsFrame = true;
      this.scene.environmentIntensity = .62;
    }, undefined, () => this.onLoadError?.('室内环境光未载入，当前使用场景灯光'));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(INITIAL_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 75;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.walkKeys = new Set();
    this.walking = false;
    this.cutaway = true;
    this.controls.update();

    const { room, lights } = createBuilding(this.scene, this.sceneDocument);
    this.roomGroup = room;
    this.indexArchitecture();
    this.lights = lights;

    this.sceneDocument.placements.forEach((placement) => this.addPlacementRuntime(placement));
    this.syncObjectViews();
    this.bindEvents();
    this.openingView();
    this.renderer.setAnimationLoop(() => this.update());
  }

  syncObjectViews() {
    const views = deriveObjectViews(this.sceneDocument).map((view) => ({
      ...view,
      hasModel: Boolean(this.getObjectGroup(view.id)?.userData.hasRealModel),
    }));
    this.objects.splice(0, this.objects.length, ...views);
  }

  commitScene(sceneDocument, { rebuild = false } = {}) {
    this.sceneDocument = assertSceneDocument(sceneDocument);
    this.needsFrame = true;
    const rooms = this.sceneDocument.buildings.flatMap((b) => b.floors.flatMap((f) => f.rooms));
    if (!rooms.some((room) => room.id === this.activeRoomId) && !this.sceneDocument.outdoorZones.some(z => z.id === this.activeRoomId)) this.activeRoomId = rooms[0]?.id;
    this.syncObjectViews();
    if (rebuild) this.rebuildScene();
    return this.sceneDocument;
  }

  setActiveRoom(roomId) {
    this.showAllLevels = false;
    this.activeRoomId = roomId;
    this.onRoomChange?.(roomId);
    if (this.walking) this.enterRoom();
    else this.focusRoom(roomId);
  }

  focusRoom(roomId) {
    const yard = this.sceneDocument.outdoorZones.find(z => z.id === roomId);
    if (yard) {
      const bounds = getRoomBounds(yard), distance = Math.max(bounds.width, bounds.depth, 3);
      this.startTween(new THREE.Vector3(bounds.centerX + distance*.42, yard.elevation + distance*.9, bounds.centerY - distance*.92),
        new THREE.Vector3(bounds.centerX, yard.elevation+.4, bounds.centerY),650);
      return;
    }
    for (const building of this.sceneDocument.buildings) {
      for (const floor of building.floors) {
        const room = floor.rooms.find((entry) => entry.id === roomId);
        if (!room) continue;
        const bounds = getRoomBounds(room);
        const distance = Math.max(bounds.width, bounds.depth, 4);
        const base = floor.elevation + building.origin.y;
        this.startTween(
          new THREE.Vector3(building.origin.x + bounds.centerX + distance * 0.25, base + distance * 0.85, building.origin.z + bounds.centerY + distance * 1.25),
          new THREE.Vector3(building.origin.x + bounds.centerX, base + 0.8, building.origin.z + bounds.centerY),
          650,
        );
        return;
      }
    }
  }

  originOf(containerId) {
    const context = findRoomContext(this.sceneDocument, containerId);
    if (!context) return new THREE.Vector3(0, this.sceneDocument.outdoorZones?.find(z=>z.id===containerId)?.elevation || 0, 0);
    const { building, floor } = context;
    return new THREE.Vector3(building.origin.x, building.origin.y + floor.elevation, building.origin.z);
  }

  getSceneDocument() {
    return this.sceneDocument;
  }

  replaceSceneDocument(sceneDocument) {
    this.found.clear();
    return this.commitScene(assertSceneDocument(structuredClone(sceneDocument)), { rebuild: true });
  }

  setAssetUrlResolver(resolver) {
    this.assetUrlResolver = resolver;
  }

  validateScene() {
    return validateSceneDocument(this.sceneDocument);
  }

  resolvePlacementId(id) {
    if (this.sceneDocument.placements.some((entry) => entry.id === id)) return id;
    return this.sceneDocument.placements.find((entry) => entry.assetId === id)?.id || id;
  }

  getObjectGroup(id) {
    return this.placementGroups[this.resolvePlacementId(id)];
  }

  addPlacement(placement) {
    const next = addPlacementToDocument(this.sceneDocument, placement);
    this.commitScene(next);
    const added = next.placements.find((entry) => entry.id === placement.id);
    this.addPlacementRuntime(added);
    this.syncObjectViews();
    return added;
  }

  removePlacement(placementId) {
    const resolvedId = this.resolvePlacementId(placementId);
    const next = removePlacementFromDocument(this.sceneDocument, resolvedId);
    const group = this.placementGroups[resolvedId];
    if (group) {
      const objectId = group.userData.objectId;
      this.scene.remove(group);
      this.disposeRuntimeGroup(group);
      this.pickables = this.pickables.filter((entry) => entry !== group);
      delete this.placementGroups[resolvedId];
      delete this.objectGroups[objectId];
      const remaining = Object.values(this.placementGroups).find((entry) => entry.userData.objectId === objectId);
      if (remaining) this.objectGroups[objectId] = remaining;
      else this.found.delete(objectId);
    }
    this.commitScene(next);
    return next;
  }

  updatePlacementTransform(placementId, transform) {
    const resolvedId = this.resolvePlacementId(placementId);
    const next = updatePlacementTransformInDocument(this.sceneDocument, resolvedId, transform);
    this.commitScene(next);
    const placement = next.placements.find((entry) => entry.id === resolvedId);
    const group = this.placementGroups[resolvedId];
    if (group) {
      group.position.set(placement.position.x, placement.position.y, placement.position.z).add(this.originOf(placement.containerId));
      group.rotation.set(placement.rotation.x, placement.rotation.y, placement.rotation.z);
      group.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
      group.userData.hoverScale = 1;
    }
    return placement;
  }

  syncPlacementFromRuntime(placementId) {
    const resolvedId = this.resolvePlacementId(placementId);
    const group = this.placementGroups[resolvedId];
    if (!group) throw new Error(`Unknown runtime placement ${resolvedId}`);
    const hoverScale = group.userData.hoverScale || 1;
    const local = group.position.clone().sub(this.originOf(this.sceneDocument.placements.find(p=>p.id === resolvedId).containerId));
    return this.updatePlacementTransform(resolvedId, {
      position: { x: local.x, y: local.y, z: local.z },
      rotation: { x: group.rotation.x, y: group.rotation.y, z: group.rotation.z },
      scale: {
        x: group.scale.x / hoverScale,
        y: group.scale.y / hoverScale,
        z: group.scale.z / hoverScale,
      },
    });
  }

  updateRoomDimensions(roomId, dimensions, source = 'estimated') {
    const next = updateRoomDimensionsInDocument(this.sceneDocument, roomId, dimensions, source);
    this.commitScene(next, { rebuild: true });
    return next;
  }

  rebuildScene() {
    if (this.roomGroup) {
      this.scene.remove(this.roomGroup);
      this.disposeRuntimeGroup(this.roomGroup);
    }
    for (const group of Object.values(this.placementGroups)) {
      this.scene.remove(group);
      this.disposeRuntimeGroup(group);
    }
    this.placementGroups = {};
    this.objectGroups = {};
    this.pickables = [];
    this.hovered = null;

    const { room, lights } = createBuilding(this.scene, this.sceneDocument);
    this.roomGroup = room;
    this.indexArchitecture();
    this.lights = lights;
    this.sceneDocument.placements.forEach((placement) => this.addPlacementRuntime(placement));
    this.syncObjectViews();
    return this.sceneDocument;
  }

  async loadAsset(assetId, appearance = {}) {
    const asset = this.sceneDocument.assets.find((entry) => entry.id === assetId);
    if (!asset) throw new Error(`Unknown asset ${assetId}`);
    let model;
    if (asset.modelUrl) {
      const resolvedUrl = this.assetUrlResolver ? await this.assetUrlResolver(asset) : asset.modelUrl;
      model = await loadSharedGlb(resolvedUrl);
    } else if (asset.source === 'procedural' && asset.procedural) {
      model = createPlaceholder(asset.procedural.kind, asset.procedural.color);
    } else {
      throw new Error(`Asset ${assetId} has no loadable model`);
    }
    fitToSize(model, getAssetSize(asset));
    const materialId = appearance.materialId ?? asset.appearance?.materialId;
    if (materialId) {
      const definition = this.sceneDocument.materials?.find((material) => material.id === materialId);
      if (definition) {
        model.traverse((child) => {
          if (child.isMesh) child.material = getPBRMaterial(definition);
        });
      }
    }
    const color = appearance.color ?? asset.appearance?.color;
    if (color) {
      model.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material?.color?.set(color));
      });
    }
    return model;
  }

  addPlacementRuntime(placement) {
    const asset = this.sceneDocument.assets.find((entry) => entry.id === placement.assetId);
    if (!asset) throw new Error(`Placement ${placement.id} references missing asset ${placement.assetId}`);

    const group = new THREE.Group();
    group.name = `placement:${placement.id}`;
    group.position.set(placement.position.x, placement.position.y, placement.position.z).add(this.originOf(placement.containerId));
    group.userData.floorId = findRoomContext(this.sceneDocument, placement.containerId)?.floor.id;
    group.rotation.set(placement.rotation.x, placement.rotation.y, placement.rotation.z);
    group.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
    group.userData.objectId = asset.id;
    group.userData.assetId = asset.id;
    group.userData.placementId = placement.id;
    group.userData.hoverScale = 1;

    const content = asset.procedural
      ? fitToSize(createPlaceholder(asset.procedural.kind, asset.procedural.color), getAssetSize(asset))
      : new THREE.Group();
    group.add(content);
    group.userData.content = content;

    this.scene.add(group);
    this.pickables.push(group);
    this.placementGroups[placement.id] = group;
    if (!this.objectGroups[asset.id]) this.objectGroups[asset.id] = group;

    if (asset.modelUrl) this.loadPlacementContent(group, placement, asset);
    return group;
  }

  refreshPlacementAppearance(scene, placementId) {
    this.commitScene(scene);
    const placement = scene.placements.find(p => p.id === placementId);
    const asset = scene.assets.find(a => a.id === placement.assetId);
    const group = this.placementGroups[placementId];
    if (group) this.loadPlacementContent(group, placement, asset);
  }

  loadPlacementContent(group, placement, asset) {
      const requestedUrl = asset.modelUrl;
      const revision = (group.userData.requestedRevision || 0) + 1;
      group.userData.requestedRevision = revision;
      delete group.userData.loadError;
      this.loadAsset(asset.id, placement.appearance)
        .then((model) => {
          if (this.placementGroups[placement.id] !== group || group.userData.requestedRevision !== revision) { this.disposeRuntimeGroup(model); return; }
          const currentAsset = this.sceneDocument.assets.find((entry) => entry.id === asset.id);
          if (currentAsset?.modelUrl !== requestedUrl) { this.disposeRuntimeGroup(model); return; }
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          const previous = group.userData.content;
          group.remove(previous);
          this.disposeRuntimeGroup(previous);
          group.add(model);
          group.userData.content = model;
          group.userData.hasRealModel = Boolean(requestedUrl);
          group.userData.contentRevision = revision;
          this.needsFrame = true;
          this.syncObjectViews();
          this.onModelLoaded?.(asset.id);
        })
        .catch((error) => {
          if (group.userData.requestedRevision !== revision) return;
          group.userData.loadError = error.message;
          if (this.placementGroups[placement.id] === group) this.onLoadError?.(`${asset.name} 加载失败：${error.message}`);
        });
  }

  disposeRuntimeGroup(group) {
    disposeSceneGroup(group);
  }

  bindEvents() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('pointerdown', (event) => {
      this.downPos = { x: event.clientX, y: event.clientY };
    });

    canvas.addEventListener('pointerup', (event) => {
      if (!this.downPos) return;
      const moved = Math.hypot(event.clientX - this.downPos.x, event.clientY - this.downPos.y);
      this.downPos = null;
      if (moved > 7) return;
      this.setPointer(event);
      const hit = this.pick();
      if (hit) this.onObjectClick?.(hit.userData.objectId);
    });

    canvas.addEventListener('pointermove', (event) => {
      this.setPointer(event);
      const hit = this.pick();
      this.hovered = hit;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    });

    const keyEvent = (e, down) => {
      if (!this.walking || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowright', 'arrowleft', 'arrowdown'].includes(key)) {
        e.preventDefault();
        if (down) this.walkKeys.add(key); else this.walkKeys.delete(key);
      }
    };
    window.addEventListener('keydown', (e) => keyEvent(e, true));
    window.addEventListener('keyup', (e) => keyEvent(e, false));
    window.addEventListener('blur', () => this.walkKeys.clear());
    canvas.addEventListener('pointerdown', (e) => {
      if (this.walking) { this.walkPointer = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.walking || !this.walkPointer) return;
      this.walkYaw -= (e.clientX - this.walkPointer[0]) * 0.006;
      this.walkPitch = THREE.MathUtils.clamp(this.walkPitch - (e.clientY - this.walkPointer[1]) * 0.005, -1.1, 1.1);
      this.walkPointer = [e.clientX, e.clientY];
    });
    const release = () => { this.walkPointer = null; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    const resize = () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.interiorComposer?.setSize(width,height);
      this.needsFrame = true;
    };
    new ResizeObserver(() => { if (this.container.clientWidth) resize(); }).observe(this.container);
  }

  setPointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables.filter(g=>g.visible), true);
    if (!hits.length) return null;
    let node = hits[0].object;
    while (node && !node.userData.objectId) node = node.parent;
    return node || null;
  }

  pickSurface() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.roomGroup.children, ...this.pickables], true);
    for (const hit of hits) {
      let parent = hit.object;
      while (parent && parent.visible) parent = parent.parent;
      if (parent) continue;
      let node = hit.object;
      while (node) {
        if (node.userData.placementId) return { type: 'placement', placementId: node.userData.placementId, object: node };
        if (node.userData.outdoorZoneId) return { type:'floor', roomId:node.userData.outdoorZoneId, point:hit.point, object:node };
        if (node.userData.surfaceType) return { type: node.userData.surfaceType, roomId: node.userData.faceRooms?.[hit.face?.materialIndex] || node.userData.roomId, point: hit.point, object: node };
        node = node.parent;
      }
    }
    return null;
  }

  startTween(toPos, toTarget, duration = 800) {
    this.tween = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: toPos.clone(),
      toTarget: toTarget.clone(),
      start: performance.now(),
      duration,
    };
  }

  focusObject(id) {
    const group = this.getObjectGroup(id);
    const data = this.objects.find((item) => item.id === id);
    if (!group || !data) return;

    const target = group.position.clone().add(new THREE.Vector3(0, data.size * 0.45, 0));
    const roomCenter = new THREE.Vector3(0, 1.0, 0.8);
    const direction = roomCenter.clone().sub(target).setY(0);
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1);
    direction.normalize();

    const distance = Math.max(1.6, data.size * 5);
    const cameraPos = target
      .clone()
      .add(direction.multiplyScalar(distance))
      .add(new THREE.Vector3(0, distance * 0.45, 0));
    this.startTween(cameraPos, target, 780);
  }

  openingView() {
    const context=findRoomContext(this.sceneDocument,this.activeRoomId);
    if (context?.room.designPalette) this.interiorView();
    else this.resetView(true);
  }

  interiorView() {
    const context=findRoomContext(this.sceneDocument,this.activeRoomId);
    if (!context) return this.resetView(true);
    this.interiorFraming=true;
    const b=getRoomBounds(context.room), origin=this.originOf(context.room.id);
    const target=new THREE.Vector3(b.minX+b.width*.45,1.03,b.minY+b.depth*.24).add(origin);
    const distance=Math.max(b.depth*.98,b.width*.94/Math.max(.65,this.camera.aspect));
    this.camera.position.copy(target).add(new THREE.Vector3(distance*.21,.38,distance));
    this.controls.target.copy(target);
    this.tween=null;
    this.controls.update();
    this.needsFrame=true;
  }

  resetView(immediate = false) {
    this.interiorFraming=false;
    const points = this.sceneDocument.buildings.flatMap((b) => b.floors.flatMap((f) => f.rooms.flatMap((r) => r.boundary)));
    if (this.showAllLevels) points.push(...this.sceneDocument.outdoorZones.flatMap(z=>z.boundary));
    if (!points.length) return;
    const box = new THREE.Box3().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0, p.y)));
    const center = box.getCenter(new THREE.Vector3());
    center.y = this.showAllLevels ? Math.max(...this.floorHeights.values()) / 2 : this.originOf(this.activeRoomId).y;
    const size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.z, size.x / Math.max(.5, this.camera.aspect), 3) * 1.14;
    const exterior = this.showAllLevels && !this.cutaway && this.sceneDocument.projectType === 'villa';
    const position = center.clone().add(exterior
      ? new THREE.Vector3(distance * .62, distance * .97, -distance * 1.12)
      : new THREE.Vector3(distance * .56, distance * 1.32, distance * .95));
    if (immediate) {
      this.tween = null;
      this.camera.position.copy(position);
      this.controls.target.copy(center);
      this.controls.update();
    } else this.startTween(position, center);
  }

  enterRoom() {
    const yard = this.sceneDocument.outdoorZones.find(z => z.id === this.activeRoomId);
    if (yard) {
      const b = getRoomBounds(yard);
      this.camera.position.set(b.centerX, yard.elevation+1.58, b.centerY);
      this.showAllLevels = false;
      this.walkYaw = Math.PI;
      this.walkPitch = -.1;
      this.stairFloorId = null;
      return;
    }
    const rooms = this.sceneDocument.buildings.flatMap((b) => b.floors.flatMap((f) => f.rooms));
    const room = rooms.find((r) => r.id === this.activeRoomId) || rooms[0];
    const bounds = getRoomBounds(room);
    this.camera.position.set(bounds.centerX + bounds.width * .26, Math.min(1.58, room.ceilingHeight.value * .72), bounds.centerY + bounds.depth * .38);
    this.camera.position.add(this.originOf(this.activeRoomId));
    this.showAllLevels = false;
    this.walkYaw = .48;
    this.walkPitch = -.19;
    this.stairFloorId = null;
  }

  indexArchitecture() {
    this.levels = this.roomGroup.children.filter(n => n.userData.floorId);
    this.floorHeights = new Map(this.sceneDocument.buildings.flatMap(b => b.floors.map(f=>[f.id,f.elevation+b.origin.y])));
    this.roomLevels = new Map(this.sceneDocument.buildings.flatMap(b => b.floors.flatMap(f=>f.rooms.map(r=>[r.id,f.id]))));
    this.wallGroups = [];
    this.ceilings = [];
    this.exteriorRoofs = [];
    this.roomGroup.traverse((node) => {
      if (node.userData.exteriorRoof) this.exteriorRoofs.push(node);
      if (node.userData.walkCeiling) this.ceilings.push(node);
      if (node.userData.wallId && node.userData.outward) this.wallGroups.push(node);
    });
  }

  updateCutaway() {
    const elevation = this.floorHeights.get(this.roomLevels.get(this.activeRoomId)) || 0;
    if (this.levels.length > 1) {
      const show = id => !id || this.walking || this.showAllLevels || this.floorHeights.get(id) <= elevation;
      for (const group of this.levels) group.visible = show(group.userData.floorId);
      for (const group of this.pickables) group.visible = show(group.userData.floorId);
    }
    const { x, z } = this.controls.target;
    const dx = this.camera.position.x - x, dz = this.camera.position.z - z;
    for (const group of this.wallGroups) {
      const n = group.userData.outward;
      if(this.interiorFraming && this.sceneDocument.projectType==='room' && !this.walking && this.camera.position.y < 2.85) {
        const origin=this.originOf(this.activeRoomId), mid=group.userData.midpoint;
        group.visible=!this.cutaway || n.x*(this.camera.position.x-origin.x-mid.x)+n.z*(this.camera.position.z-origin.z-mid.z)<.025;
        continue;
      }
      group.visible = group.userData.partition || this.walking || !this.cutaway || n.x * dx + n.z * dz <= 0.025;
    }
    for (const ceiling of this.ceilings) ceiling.visible = this.walking || (this.interiorFraming && this.sceneDocument.projectType==='room' && this.camera.position.y < ceiling.getWorldPosition(this.ceilingPoint ??= new THREE.Vector3()).y-.04);
    for (const roof of this.exteriorRoofs) roof.visible = !this.walking && !this.cutaway && this.showAllLevels;
  }

  setWalkMode(enabled) {
    if (enabled === this.walking) return;
    this.walking = enabled;
    this.needsFrame = true;
    this.controls.enabled = !enabled;
    this.walkKeys.clear();
    this.walkPointer = null;
    this.tween = null;
    if (enabled) this.enterRoom(); else this.resetView(true);
  }

  updateWalk(step) {
    const keys = this.walkKeys;
    const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const side = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const direction = new THREE.Vector3(-Math.sin(this.walkYaw), 0, -Math.cos(this.walkYaw));
    const delta = direction.clone().multiplyScalar(forward).addScaledVector(new THREE.Vector3(-direction.z, 0, direction.x), side);
    if (delta.lengthSq()) {
      const ctx = findRoomContext(this.sceneDocument,this.activeRoomId);
      const fromWorld = { x:this.camera.position.x, z:this.camera.position.z };
      delta.normalize().multiplyScalar(step*2.1);
      const toWorld = { x:fromWorld.x+delta.x, z:fromWorld.z+delta.z };
      let result;
      if (ctx) {
        const {building, floor} = ctx;
        const local = p => ({x:p.x-building.origin.x,z:p.z-building.origin.z});
        result = walkStep({building,floor,from:local(fromWorld),to:local(toWorld),stairFloorId:this.stairFloorId});
        if (result) result.elevation += building.origin.y;
      }
      result ||= walkSiteStep(this.sceneDocument,this.activeRoomId,fromWorld,toWorld);
      if (result) {
        this.camera.position.set(toWorld.x,result.elevation+1.58,toWorld.z);
        this.stairFloorId=result.stairFloorId || null;
        if (result.roomId !== this.activeRoomId) {
          this.activeRoomId=result.roomId;
          this.onRoomChange?.(result.roomId);
        }
      }
    }
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.walkPitch, this.walkYaw, 0);
  }

  markFound(id) {
    if (this.found.has(id)) return;
    this.found.add(id);
    const group = this.getObjectGroup(id);
    const data = this.objects.find((item) => item.id === id);
    if (!group || !data) return;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(data.size * 0.58, data.size * 0.7, 40),
      new THREE.MeshBasicMaterial({
        color: '#e9a852',
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);
  }

  playEnding() {
    if (this.ending) return;
    this.ending = { start: performance.now() };
    this.startTween(new THREE.Vector3(2.4, 2.5, 5.8), new THREE.Vector3(0, 1.0, -0.4), 1600);
  }

  update() {
    if (this.container.hidden || document.hidden) return;
    const now = performance.now();
    const animated = Boolean(this.tween || this.ending);

    if (this.tween) {
      const t = Math.min(1, (now - this.tween.start) / this.tween.duration);
      const e = easeInOutCubic(t);
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, e);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
      if (t >= 1) this.tween = null;
    }

    if (this.ending) {
      const p = Math.min(1, (now - this.ending.start) / 2600);
      this.lights.hemi.intensity = THREE.MathUtils.lerp(0.85, 1.05, p);
      this.lights.dir.intensity = THREE.MathUtils.lerp(1.25, 1.45, p);
      this.lights.endingLight.intensity = THREE.MathUtils.lerp(0, 1.6, p);
      this.scene.background.copy(BG_START).lerp(BG_END, p);
      this.scene.fog.color.copy(this.scene.background);
    }

    const walkInput = this.walking && (this.walkKeys.size > 0 || this.walkPointer);
    if (this.walking) this.updateWalk(Math.min(.06, (now - (this.lastFrame || now)) / 1000));
    const cameraChanged = !this.walking && this.controls.update();
    this.lastFrame = now;
    // Keep interactive movement at the screen refresh rate. An occasional idle
    // frame also presents asynchronously loaded textures without busy rendering.
    if (!this.needsFrame && !animated && !walkInput && !cameraChanged && now - (this.lastRender || 0) < 700) return;
    this.needsFrame = false;
    this.lastRender = now;
    this.updateCutaway();
    this.onUpdate?.(this);
    if(this.interiorFraming && !this.walking && this.renderer.extensions.has('EXT_color_buffer_float')) {
      if(!this.interiorComposer) {
        const size=this.renderer.getSize(new THREE.Vector2());
        const composer=new EffectComposer(this.renderer);
        composer.setPixelRatio(Math.min(1.25,this.renderer.getPixelRatio()));
        composer.addPass(new RenderPass(this.scene,this.camera));
        const ao=new GTAOPass(this.scene,this.camera,size.x,size.y);
        ao.updateGtaoMaterial({radius:.32,thickness:.55,distanceExponent:1.3,samples:12});
        ao.blendIntensity=.9;
        composer.addPass(ao);
        composer.addPass(new OutputPass());
        this.interiorComposer=composer;
      }
      this.interiorComposer.render();
    } else this.renderer.render(this.scene,this.camera);
  }
}
