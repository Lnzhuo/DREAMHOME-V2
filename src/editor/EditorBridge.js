import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { cloneSceneDocument, createPlacement, getPrimaryRoomContext } from '../core/api-contracts.js';
import { findRoomContext, getRoomBounds } from '../data/scene-operations.js';
import { fitsPlacement } from '../data/placement-bounds.js';

export class EditorBridge {
  constructor(game, { onStatus } = {}) {
    this.game = game;
    this.onStatus = onStatus;
    this.listeners = new Set();
    this.past = [];
    this.future = [];
    this.selectedId = null;
    this.mode = 'translate';
    this.snap = true;
    this.assets = [];
    this.mounted = false;
  }

  mount({ propertyPanel, toolbar }) {
    if (this.mounted) return this;
    this.propertyPanel = propertyPanel;
    this.toolbar = toolbar;
    this.transformControls = new TransformControls(this.game.camera, this.game.renderer.domElement);
    this.transformHelper = this.transformControls.getHelper();
    this.game.scene.add(this.transformHelper);
    this.transformControls.setTranslationSnap(0.1);
    this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.transformControls.setScaleSnap(0.1);
    this.transformControls.addEventListener('dragging-changed', this.onDraggingChanged = (event) => {
      this.game.controls.enabled = !event.value;
      if (event.value) this.dragSnapshot = cloneSceneDocument(this.game.sceneDocument);
      else this.finishTransform();
    });
    this.transformControls.addEventListener('change', () => { this.game.needsFrame = true; });
    this.transformControls.addEventListener('objectChange', this.onObjectChange = () => {
      this.selectionBox?.update();
      this.updatePropertyValues();
    });
    let pointerStart;
    this.game.renderer.domElement.addEventListener('pointerdown', this.onPointerDown = event => {
      pointerStart = { x:event.clientX, y:event.clientY, id:event.pointerId };
    });
    this.game.renderer.domElement.addEventListener('pointerup', this.onPointerUp = event => {
      if (this.game.walking || this.transformControls.dragging || this.transformControls.axis) return;
      if (pointerStart?.id!==event.pointerId || Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>6) return;
      this.game.setPointer(event);
      const hit=this.game.pickSurface();
      const roomId=hit?.roomId || this.game.sceneDocument.placements.find(p=>p.id===hit?.placementId)?.containerId;
      if (roomId && roomId!==this.game.activeRoomId) this.game.setActiveRoom(roomId);
      this.selectPlacement(hit?.placementId || null);
    });
    this.mounted = true;
    this.renderToolbar();
    this.renderPropertyPanel();
    return this;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.event('change'));
    return () => this.listeners.delete(listener);
  }

  event(type) {
    return { type, sceneDocument: this.game.sceneDocument, selection: this.selectedId, canUndo: this.canUndo(), canRedo: this.canRedo() };
  }

  emit(type = 'change') {
    this.game.needsFrame = true;
    const event = this.event(type);
    this.listeners.forEach((listener) => listener(event));
  }

  status(message, type = 'info') {
    this.onStatus?.(message, type);
  }

  getSceneDocument() {
    return this.game.sceneDocument;
  }

  replaceSceneDocument(sceneDocument) {
    this.game.replaceSceneDocument(sceneDocument);
    this.past = [];
    this.future = [];
    this.selectPlacement(null);
    this.emit();
  }

  setAssets(assets) {
    this.assets = [...assets];
    this.renderPropertyPanel();
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }

  pushHistory(snapshot) {
    this.past.push(cloneSceneDocument(snapshot || this.game.sceneDocument));
    if (this.past.length > 50) this.past.shift();
    this.future = [];
  }

  runWithHistory(callback, { history = true } = {}) {
    const before = cloneSceneDocument(this.game.sceneDocument);
    try {
      const result = callback();
      if (history) this.pushHistory(before);
      this.emit();
      return result;
    } catch (error) {
      this.game.replaceSceneDocument(before);
      this.selectPlacement(null);
      this.emit();
      throw error;
    }
  }

  undo() {
    if (!this.canUndo()) return false;
    const selection = this.selectedId;
    this.future.push(cloneSceneDocument(this.game.sceneDocument));
    const previous = this.past.pop();
    this.game.replaceSceneDocument(previous);
    this.selectPlacement(previous.placements.some((entry) => entry.id === selection) ? selection : null);
    this.emit('history');
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const selection = this.selectedId;
    this.past.push(cloneSceneDocument(this.game.sceneDocument));
    const next = this.future.pop();
    this.game.replaceSceneDocument(next);
    this.selectPlacement(next.placements.some((entry) => entry.id === selection) ? selection : null);
    this.emit('history');
    return true;
  }

  selectPlacement(placementId) {
    this.selectedId = placementId && this.game.sceneDocument.placements.some((entry) => entry.id === placementId) ? placementId : null;
    if (this.selectionBox) {
      this.game.scene.remove(this.selectionBox);
      this.selectionBox.geometry?.dispose();
      this.selectionBox.material?.dispose();
      this.selectionBox = null;
    }
    this.transformControls?.detach();
    if (this.selectedId) {
      const group = this.game.placementGroups[this.selectedId];
      if (group) {
        this.selectionBox = new THREE.BoxHelper(group, '#b88a55');
        this.selectionBox.material.depthTest = false;
        this.selectionBox.material.transparent = true;
        this.selectionBox.material.opacity = 0.9;
        this.selectionBox.renderOrder = 999;
        this.game.scene.add(this.selectionBox);
        this.transformControls?.attach(group);
        this.transformControls?.setMode(this.mode);
      }
    }
    this.renderPropertyPanel();
    this.emit('selection');
  }

  setMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode)) return;
    this.mode = mode;
    this.transformControls?.setMode(mode);
    this.renderToolbar();
  }

  setSnap(enabled) {
    this.snap = enabled;
    this.transformControls?.setTranslationSnap(enabled ? 0.1 : null);
    this.transformControls?.setRotationSnap(enabled ? THREE.MathUtils.degToRad(15) : null);
    this.transformControls?.setScaleSnap(enabled ? 0.1 : null);
  }

  finishTransform() {
    if (!this.selectedId || !this.dragSnapshot) return;
    const before = this.dragSnapshot;
    this.dragSnapshot = null;
    try {
      const placement = this.game.syncPlacementFromRuntime(this.selectedId);
      this.assertWithinBounds(placement);
      this.pushHistory(before);
      this.status('已更新家具变换', 'success');
      this.emit();
    } catch (error) {
      this.game.replaceSceneDocument(before);
      this.selectPlacement(this.selectedId);
      this.status(`已回滚：${error.message}`, 'error');
    }
    this.renderPropertyPanel();
  }

  assertWithinBounds(placement, sceneDocument = this.game.sceneDocument) {
    const room = findRoomContext(sceneDocument, placement.containerId)?.room || sceneDocument.outdoorZones?.find(z => z.id === placement.containerId);
    if (!room) throw new Error('找不到家具所在空间');
    const asset = sceneDocument.assets.find((entry) => entry.id === placement.assetId);
    if (!fitsPlacement(placement, asset, room)) {
      throw new Error('家具超出房间边界');
    }
    if (placement.position.y < -0.001) throw new Error('家具不能穿入地面');
    return true;
  }

  addAsset(asset, options = {}) {
    const { containerId = this.game.activeRoomId || getPrimaryRoomContext(this.game.sceneDocument).room.id, history = true } = options;
    const room = findRoomContext(this.game.sceneDocument, containerId)?.room || this.game.sceneDocument.outdoorZones?.find(z => z.id === containerId);
    if (!room) throw new Error('请选择房间或庭院');
    const bounds = getRoomBounds(room);
    const position = options.position || { x: bounds.centerX, y: 0, z: bounds.centerY };
    return this.runWithHistory(() => {
      const next = cloneSceneDocument(this.game.sceneDocument);
      if (!next.assets.some((entry) => entry.id === asset.id)) next.assets.push(cloneSceneDocument(asset));
      const placement = createPlacement({
        id: `placement-${asset.id}-${crypto.randomUUID().slice(0, 8)}`,
        assetId: asset.id,
        containerId,
        position,
      });
      const stored = next.assets.find(entry=>entry.id===asset.id);
      if (asset.userCalibrated) {
        const axes = { x:'width', y:'height', z:'depth' };
        if (!next.placements.some(item=>item.assetId===asset.id)) stored.dimensions = structuredClone(asset.dimensions);
        for (const [axis,dimension] of Object.entries(axes)) {
          const reference = stored.dimensions[dimension]?.value;
          if (reference>0) placement.scale[axis] = asset.dimensions[dimension].value / reference;
        }
      }
      if (!options.position && !fitsPlacement(placement, stored, room)) {
        for (const fractionX of [.3,.7,.15,.85,.5]) {
          placement.position.x = bounds.minX + bounds.width * fractionX;
          const fit = [.3,.7,.15,.85,.5].find(fractionZ => {
            placement.position.z = bounds.minY + bounds.depth * fractionZ;
            return fitsPlacement(placement, stored, room);
          });
          if (fit) break;
        }
      }
      this.assertWithinBounds(placement, next);
      next.placements.push(placement);
      this.game.commitScene(next);
      this.game.addPlacementRuntime(placement);
      this.game.syncObjectViews();
      this.selectPlacement(placement.id);
      return placement;
    }, { history });
  }

  removePlacement(placementId, { history = true } = {}) {
    return this.runWithHistory(() => {
      const result = this.game.removePlacement(placementId);
      this.selectPlacement(null);
      return result;
    }, { history });
  }

  replaceAsset(placementId, newAssetId, { history = true, asset = null } = {}) {
    return this.runWithHistory(() => {
      const next = cloneSceneDocument(this.game.sceneDocument);
      if (asset && !next.assets.some((entry) => entry.id === newAssetId)) next.assets.push(cloneSceneDocument(asset));
      const placement = next.placements.find((entry) => entry.id === placementId);
      if (!placement || !next.assets.some((entry) => entry.id === newAssetId)) throw new Error('替换目标不存在');
      placement.assetId = newAssetId;
      this.assertWithinBounds(placement,next);
      this.game.commitScene(next, { rebuild: true });
      this.selectPlacement(placementId);
      return placement;
    }, { history });
  }

  updatePlacementTransform(placementId, transform, { history = true } = {}) {
    return this.runWithHistory(() => {
      const current = this.game.sceneDocument.placements.find((entry) => entry.id === placementId);
      if (!current) throw new Error('家具不存在');
      const candidate = cloneSceneDocument(current);
      for (const key of ['position', 'rotation', 'scale']) {
        if (transform[key]) candidate[key] = { ...candidate[key], ...transform[key] };
      }
      this.assertWithinBounds(candidate);
      return this.game.updatePlacementTransform(placementId, transform);
    }, { history });
  }

  setAssetColor(assetId, color, { history = true } = {}) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('颜色格式无效');
    return this.runWithHistory(() => {
      const next = cloneSceneDocument(this.game.sceneDocument);
      const asset = next.assets.find((entry) => entry.id === assetId);
      if (!asset) throw new Error('资产不存在');
      asset.appearance = { ...(asset.appearance || {}), color };
      if (asset.procedural) asset.procedural.color = color;
      this.game.commitScene(next, { rebuild: true });
      this.selectPlacement(this.selectedId);
      this.emit();
      return asset;
    }, { history });
  }

  setRoomMaterial(roomId, surface, material, {history = true} = {}) {
    return this.runWithHistory(() => {
      const doc = cloneSceneDocument(this.game.sceneDocument);
      const room = findRoomContext(doc,roomId)?.room;
      if (!room || !['wall','floor'].includes(surface)) throw new Error('请选择房间的墙面或地板');
      const id = this.storeMaterial(doc,material);
      room[surface === 'wall' ? 'wallMaterialId' : 'floorMaterialId'] = id;
      this.game.commitScene(doc,{rebuild:true});
      this.selectPlacement(this.selectedId);
      return room;
    }, {history});
  }

  storeMaterial(doc, material) {
    const parameters=m=>JSON.stringify([m.baseColor || '#ffffff',m.roughness ?? 1,m.metalness ?? 0,m.normalStrength ?? 1,m.aoIntensity ?? 1,m.repeat || [1,1]]);
    const key=parameters(material);
    const saved=doc.materials.find(m=>(m.id===material.id || m.presetId===material.id) && parameters(m)===key);
    if(saved) return saved.id;
    const variant=material.presetId || doc.materials.some(m=>m.id===material.id);
    const id=variant ? material.id+'-variant-'+crypto.randomUUID() : material.id;
    doc.materials.push({...structuredClone(material),id,...(variant?{presetId:material.id}:{})});
    return id;
  }

  setPlacementAppearance(placementId, appearance, material, { history = true } = {}) {
    return this.runWithHistory(() => {
      const next = cloneSceneDocument(this.game.sceneDocument);
      const placement = next.placements.find((p) => p.id === placementId);
      if (!placement) throw new Error('请选择家具');
      if (material) appearance = { ...appearance, materialId: this.storeMaterial(next, material) };
      if (appearance.materialId && !next.materials?.some((m) => m.id === appearance.materialId)) throw new Error('材料不存在');
      if (appearance.color && !/^#[0-9a-f]{6}$/i.test(appearance.color)) throw new Error('颜色格式无效');
      placement.appearance = { ...placement.appearance, ...appearance };
      this.game.refreshPlacementAppearance(next, placementId);
      this.selectPlacement(placementId);
      return placement;
    }, { history });
  }

  setAssetMaterial(assetId, materialId, { history = true } = {}) {
    return this.runWithHistory(() => {
      const next = cloneSceneDocument(this.game.sceneDocument);
      const asset = next.assets.find((entry) => entry.id === assetId);
      if (!asset) throw new Error('资产不存在');
      if (!next.materials?.some((entry) => entry.id === materialId)) throw new Error('材料不存在');
      asset.appearance = { ...(asset.appearance || {}), materialId };
      this.game.commitScene(next, { rebuild: true });
      this.selectPlacement(this.selectedId);
      this.emit();
      return asset;
    }, { history });
  }

  renderToolbar() {
    if (!this.toolbar) return;
    this.toolbar.innerHTML = `
      <div class="dh-toolbar-group"><button data-mode="translate">移动</button><button data-mode="rotate">旋转</button><button data-mode="scale">缩放</button></div>
      <div class="dh-toolbar-group"><label><input type="checkbox" data-action="snap" ${this.snap ? 'checked' : ''}/> 0.1m / 15° 吸附</label></div>
      <div class="dh-toolbar-group"><button data-action="delete">删除家具</button></div>`;
    this.toolbar.querySelectorAll('[data-mode]').forEach((button) => {
      button.dataset.active = String(button.dataset.mode === this.mode);
      button.addEventListener('click', () => this.setMode(button.dataset.mode));
    });
    this.toolbar.querySelector('[data-action="snap"]').addEventListener('change', (event) => this.setSnap(event.target.checked));
    this.toolbar.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (this.selectedId) this.removePlacement(this.selectedId);
    });
  }

  renderPropertyPanel() {
    if (!this.propertyPanel) return;
    const placement = this.game.sceneDocument.placements.find((entry) => entry.id === this.selectedId);
    if (!placement) {
      this.propertyPanel.innerHTML = '<div class="dh-empty">选择一件家具开始编辑</div>';
      return;
    }
    const asset = this.game.sceneDocument.assets.find((entry) => entry.id === placement.assetId);
    const dimensions = `${asset.dimensions.width.value?.toFixed(2) || '?'} × ${asset.dimensions.depth.value?.toFixed(2) || '?'} × ${asset.dimensions.height.value?.toFixed(2) || '?'} m`;
    this.propertyPanel.innerHTML = `
      <div class="dh-property-name"></div><div class="dh-muted">${asset.source} · ${asset.dimensions.width.source === 'measured' ? '实测尺寸' : '估算尺寸'} · ${dimensions}</div>
      <div class="dh-field"><label>X / Y / Z</label><div class="dh-row"><input data-field="x" type="number" step="0.1"/><input data-field="y" type="number" step="0.1"/><input data-field="z" type="number" step="0.1"/></div></div>
      <div class="dh-field"><label>旋转角度</label><input data-field="rotation" type="number" step="15"/></div>
      <div class="dh-field"><label>等比缩放</label><input data-field="scale" type="number" min="0.1" step="0.1"/></div>
      <div class="dh-field"><label>材质颜色</label><input data-field="color" type="color" value="${placement.appearance?.color || asset.appearance?.color || asset.procedural?.color || '#ffffff'}"/></div>
      <div class="dh-field"><label>替换为</label><select data-field="replace"></select></div>`;
    this.propertyPanel.querySelector('.dh-property-name').textContent = asset.name;
    const select = this.propertyPanel.querySelector('[data-field="replace"]');
    for (const candidate of this.assets.length ? this.assets : this.game.sceneDocument.assets) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.name;
      option.selected = candidate.id === asset.id;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      const candidates = this.assets.length ? this.assets : this.game.sceneDocument.assets;
      this.replaceAsset(placement.id, select.value, { asset: candidates.find((entry) => entry.id === select.value) });
    });
    this.propertyPanel.querySelectorAll('[data-field="x"],[data-field="y"],[data-field="z"]').forEach((input) => {
      input.addEventListener('change', () => this.updatePlacementTransform(placement.id, { position: { [input.dataset.field]: Number(input.value) } }));
    });
    this.propertyPanel.querySelector('[data-field="rotation"]').addEventListener('change', (event) => {
      this.updatePlacementTransform(placement.id, { rotation: { y: THREE.MathUtils.degToRad(Number(event.target.value)) } });
    });
    this.propertyPanel.querySelector('[data-field="scale"]').addEventListener('change', (event) => {
      const value = Math.max(0.1, Number(event.target.value));
      this.updatePlacementTransform(placement.id, { scale: { x: value, y: value, z: value } });
    });
    this.propertyPanel.querySelector('[data-field="color"]').addEventListener('change', (event) => this.setPlacementAppearance(placement.id, { color: event.target.value }));
    this.updatePropertyValues();
  }

  updatePropertyValues() {
    if (!this.propertyPanel || !this.selectedId) return;
    const placement = this.game.sceneDocument.placements.find((entry) => entry.id === this.selectedId);
    if (!placement) return;
    for (const key of ['x', 'y', 'z']) {
      const input = this.propertyPanel.querySelector(`[data-field="${key}"]`);
      if (input) input.value = placement.position[key].toFixed(2);
    }
    const rotation = this.propertyPanel.querySelector('[data-field="rotation"]');
    if (rotation) rotation.value = Math.round(THREE.MathUtils.radToDeg(placement.rotation.y));
    const scale = this.propertyPanel.querySelector('[data-field="scale"]');
    if (scale) scale.value = placement.scale.x.toFixed(2);
  }

  update() {
    this.selectionBox?.update();
  }

  destroy() {
    this.transformControls?.dispose();
    this.transformHelper?.removeFromParent();
    this.selectionBox?.removeFromParent();
    if (this.onPointerDown) this.game.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    if (this.onPointerUp) this.game.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.listeners.clear();
    this.propertyPanel && (this.propertyPanel.innerHTML = '');
    this.toolbar && (this.toolbar.innerHTML = '');
  }
}
