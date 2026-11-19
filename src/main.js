import './styles.css';
import './styles/editor-shell.css';
import './ai/assistant-panel.css';
import './ui/settings/api-settings.css';
import { createProjectWizard } from './ui/onboarding/createProjectWizard.js';
import { validateSceneDocument } from './data/scene-document.js';
import { Game } from './game/Game.js';
import { createEditorShell } from './ui/editor-shell/createEditorShell.js';
import { EditorBridge } from './editor/EditorBridge.js';
import { AssetRepository, ProjectRepository, ProjectPanel } from './storage/index.js';
import { AssetLibrary } from './ui/assets/AssetLibrary.js';
import { SceneCommandExecutor, AIAssistantPanel } from './ai/index.js';
import { FloorplanView } from './ui/floorplan/FloorplanView.js';
import { MaterialLibrary } from './ui/materials/MaterialLibrary.js';
import { attachReferencePlan } from './ui/floorplan/ReferencePlan.js';
import { downloadDesign, readDesign } from './storage/DesignFiles.js';
import { INTERIOR_STYLES, applyInteriorStyle } from './data/interior-styles.js';
import { ApiSettings } from './ui/settings/ApiSettings.js';
import { RoomEditor } from './ui/rooms/RoomEditor.js';
import { BUILT_IN_MATERIALS } from './data/v2-contracts.js';

async function boot() {
  const settings = new ApiSettings();
  const openAiSettings = () => settings.open('llm');
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = '正在打开 DREAMHOME…';
  document.body.appendChild(loading);

  const assetRepository = await new AssetRepository().init();
  const projectRepository = await new ProjectRepository().init();

  const savedProjects = await projectRepository.listProjects();
  const libraryIndex = await (await fetch('/api/library/index.json')).json();
  let sceneDocument;
  function editableDocument(doc) {
    if (!doc?.buildings?.some(b => b.floors?.some(f => f.rooms?.length)) || !validateSceneDocument(doc).valid) {
      throw new Error('项目数据不完整，原记录已保留。可以打开其他项目或新建设计。');
    }
    return doc;
  }
  const entryUrl=new URL(location.href);
  const browseStyles=entryUrl.searchParams.get('home')==='styles';
  if (savedProjects.length && !browseStyles) {
    try { sceneDocument = editableDocument(await projectRepository.loadProject(savedProjects[0].projectId)); }
    catch { /* Preserve the damaged record and show the project chooser. */ }
  }
  if (!sceneDocument) {
    loading.hidden = true;
    let reopened = false;
    const selected = await createProjectWizard({ catalogAssets: libraryIndex.assets, recentProjects: savedProjects, onOpenApi: openAiSettings, onOpenRecent: async id => {
      const doc = editableDocument(await projectRepository.loadProject(id));
      reopened = true;
      return doc;
    } });
    if(browseStyles) {entryUrl.searchParams.delete('home'); history.replaceState(null,'',entryUrl);}
    loading.hidden = false;
    sceneDocument = reopened ? selected : await projectRepository.createProject({ name: selected.name, sceneDocument: applyTemplateFinishes(selected) });
  }

  function prepareDocument(doc) {
    for (const asset of doc.assets) {
      const current = libraryIndex.assets.find(item=>item.id===asset.id);
      if (current && !asset.boundingBox) asset.boundingBox = current.boundingBox;
      if (current?.planThumbnailUrl && !asset.planThumbnailUrl) asset.planThumbnailUrl = current.planThumbnailUrl;
      if (asset.modelUrl?.startsWith('/api/assets/')) {
        const catalogAsset = libraryIndex.assets.find(item => item.id === asset.id);
        if (catalogAsset) { asset.modelUrl = catalogAsset.modelUrl; asset.thumbnailUrl = catalogAsset.thumbnailUrl; }
      }
    }
    doc.materials = [...new Map([...BUILT_IN_MATERIALS, ...libraryIndex.materials, ...(doc.materials || [])].map((m) => [m.id, m])).values()];
    return doc;
  }
  function applyTemplateFinishes(doc) {
    for (const room of doc.buildings.flatMap(b=>b.floors).flatMap(f=>f.rooms)) {
      if (room.floorMaterialId !== 'default-floor') continue;
      room.floorMaterialId = ({ bathroom:'anti_skid_tiles', kitchen:'floor_tiles_02', balcony:'slab_tiles',
        laundry:'floor_tiles_02', corridor:'terrazzo_tiles', entryway:'terrazzo_tiles',
        master_bedroom:'wooden_floor_02', secondary_bedroom:'wooden_floor_02' })[room.roomType] || 'oak_wood_planks';
    }
    return prepareDocument(doc);
  }
  prepareDocument(sceneDocument);

  const shell = createEditorShell({ projectName: sceneDocument.name });
  document.getElementById('app').appendChild(shell.root);
  const game = new Game(shell.canvas, sceneDocument, {
    assetUrlResolver: (asset) => assetRepository.resolveAssetUrl(asset),
  });

  const editor = new EditorBridge(game, {
    onStatus: (message, type) => shell.setUploadState(type, message),
  }).mount({ propertyPanel: shell.propertyPanel, toolbar: shell.toolbar });
  shell.settingsButton.addEventListener('click', openAiSettings);
  const roomEditor = new RoomEditor({ root: shell.roomPanel, editor }).mount();
  const styleSelect = shell.root.querySelector('[data-action="style"]');
  for (const style of Object.keys(INTERIOR_STYLES)) styleSelect.add(new Option(style, style));
  styleSelect.addEventListener('change', () => {
    if (!styleSelect.value) return;
    editor.runWithHistory(() => {
      const doc = structuredClone(game.sceneDocument);
      const room = doc.buildings.flatMap((b) => b.floors).flatMap((f) => f.rooms).find((r) => r.id === game.activeRoomId);
      applyInteriorStyle(room, styleSelect.value);
      game.commitScene(doc, { rebuild: true });
      editor.selectPlacement(editor.selectedId);
    });
  });
  game.onUpdate = () => editor.update();
  const floorplan = new FloorplanView({ root: shell.floorplan, editor }).mount();
  attachReferencePlan({ root: shell.root.querySelector('.dh-reference-panel'), editor, repo: assetRepository, floorplan });
  game.onRoomChange = () => {
    floorplan.render();
    if (editor.selectedId && game.sceneDocument.placements.find(p=>p.id===editor.selectedId)?.containerId !== game.activeRoomId) editor.selectPlacement(null);
    roomEditor?.render?.();
    renderSpaceTree();
  };
  function syncTransformControls() {
    const view = shell.root.dataset.viewMode || '3d';
    const enabled = view === '3d' && shell.root.dataset.editorMode === 'manual';
    editor.transformControls.enabled = enabled;
    editor.transformHelper.visible = enabled && Boolean(editor.selectedId);
    game.needsFrame = true;
  }
  shell.root.addEventListener('editor-mode-change', syncTransformControls);

  const focusButton=shell.root.querySelector('[data-action=focus]');
  function showRoomOnly(enabled) {
    shell.root.dataset.roomOnly=String(enabled);
    focusButton.textContent=enabled?'展开编辑面板':'收起面板';
    focusButton.setAttribute('aria-pressed',String(enabled));
  }
  focusButton.onclick=()=>showRoomOnly(shell.root.dataset.roomOnly!=='true');
  shell.root.querySelectorAll('[data-editor-mode-choice],[data-panel]').forEach(b=>b.addEventListener('click',()=>showRoomOnly(false)));
  showRoomOnly(Boolean(sceneDocument.buildings[0].floors[0].rooms[0]?.designPalette));

  function setViewMode(mode) {
    shell.root.dataset.viewMode = mode;
    const is2d = mode === '2d';
    game.setWalkMode(mode === 'walk');
    shell.canvas.hidden = is2d;
    shell.floorplan.hidden = !is2d;
    shell.viewButtons.forEach((button) => { button.dataset.active = String(button.dataset.view === mode); });
    syncTransformControls();
    if (editor.selectionBox) editor.selectionBox.visible = !is2d;
    if (is2d) floorplan.render();
  }
  for (const key of shell.root.querySelectorAll('[data-walk]')) {
    key.onpointerdown = event => {
      event.preventDefault();
      key.setPointerCapture(event.pointerId);
      game.walkKeys.add(key.dataset.walk);
    };
    key.onlostpointercapture = () => game.walkKeys.delete(key.dataset.walk);
  }
  roomEditor.showExterior = () => {
    editor.selectPlacement(null); setViewMode('3d'); game.showAllLevels = true; game.cutaway = false;
    shell.root.querySelector('[data-action="cutaway"]').setAttribute('aria-pressed','false');
    game.resetView();
  };
  shell.viewButtons.forEach((button) => button.addEventListener('click', () => setViewMode(button.dataset.view)));

  const executor = new SceneCommandExecutor(editor);
  const aiPanel = new AIAssistantPanel({
    root: shell.aiPanel,
    executor,
    onOpenApi: openAiSettings,
    onSourceMismatch: () => settings.refresh().catch(showAiSource),
  }).mount();
  const showAiSource = () => aiPanel.setService(settings.status?.llm);
  settings.addEventListener('change', showAiSource);
  if (settings.status) showAiSource();
  settings.refresh().catch(showAiSource);

  const assetLibrary = new AssetLibrary({
    root: shell.assetLibrary,
    assetRepository,
    onCatalogChange: entries => {
      editor.setAssets(entries);
      libraryIndex.assets = entries.filter(asset=>asset.modelUrl?.startsWith('/api/library/models/'));
    },
    onPlace: (asset) => { try { return editor.addAsset(asset); } catch (error) { shell.setUploadState('error', error.message); } },
    onJobChange: (message, type) => shell.setUploadState(type, message),
  });
  await assetLibrary.mount();
  const materialLibrary = new MaterialLibrary({
    root: shell.materialLibrary,
    onApply: (material) => {
      const placement = game.sceneDocument.placements.find((entry) => entry.id === editor.selectedId);
      if (placement) editor.setPlacementAppearance(placement.id, {}, material);
      else applyMaterialToRoom(material, 'floor');
    },
    onApplyToRoom: applyMaterialToRoom,
  });
  await materialLibrary.mount();
  shell.libraryTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const materials = button.dataset.library === 'materials';
      shell.assetLibrary.hidden = materials;
      shell.materialLibrary.hidden = !materials;
      shell.libraryTabs.forEach((tab) => { tab.dataset.active = String(tab === button); });
    });
  });

  function applyMaterialToRoom(material, surface, roomId = game.activeRoomId) {
    editor.setRoomMaterial(roomId, surface, material);
  }

  function renderSpaceTree() {
    shell.spaceTree.innerHTML = '';
    const sceneDocument = game.sceneDocument;
    for (const building of sceneDocument.buildings) {
      for (const floor of building.floors) {
        if (building.floors.length > 1) {
          const heading = document.createElement('strong');
          heading.className = 'dh-floor-label';
          heading.textContent = (floor.levelIndex + 1) + ' 层';
          shell.spaceTree.appendChild(heading);
        }
        for (const room of floor.rooms) {
          const roomItem = document.createElement('div');
          roomItem.className = 'dh-space-item';
          roomItem.dataset.selected = String(room.id === game.activeRoomId);
          roomItem.textContent = `${room.name} · ${room.ceilingHeight.value}m`;
          roomItem.addEventListener('click', () => game.setActiveRoom(room.id));
          shell.spaceTree.appendChild(roomItem);
        }
      }
    }
    for (const zone of sceneDocument.outdoorZones || []) {
      const button = document.createElement('button');
      button.className = 'dh-space-item';
      button.dataset.outdoorZoneId = zone.id;
      button.dataset.selected = String(zone.id === game.activeRoomId);
      button.textContent = zone.name;
      button.onclick = () => game.setActiveRoom(zone.id);
      shell.spaceTree.appendChild(button);
    }
    const activeRoom = sceneDocument.buildings.flatMap((b) => b.floors.flatMap((f) => f.rooms)).find((r) => r.id === game.activeRoomId);
    styleSelect.disabled = !activeRoom;
    styleSelect.value = activeRoom?.style || '';
    for (const placement of sceneDocument.placements) {
      const asset = sceneDocument.assets.find((entry) => entry.id === placement.assetId);
      const item = document.createElement('div');
      item.className = 'dh-space-item';
      item.dataset.selected = String(placement.id === editor.selectedId);
      const name = document.createElement('span');
      name.textContent = asset?.name || placement.assetId;
      const id = document.createElement('span');
      id.textContent = placement.id === editor.selectedId ? '编辑中' : '';
      item.append(name, id);
      item.addEventListener('click', () => editor.selectPlacement(placement.id));
      shell.spaceTree.appendChild(item);
    }
  }

  let lastAssetIds = '';
  async function refreshAssets() {
    lastAssetIds = game.sceneDocument.assets.map((a) => a.id).join('|');
    assetLibrary.setSceneAssets(game.sceneDocument.assets);
    editor.setAssets(await assetLibrary.refresh());
  }

  let saveChain = Promise.resolve();
  function autosave() {
    shell.setSaveState('dirty', '有未保存修改');
    const snapshot = structuredClone(game.sceneDocument);
    snapshot.name = shell.projectNameInput.value.trim() || snapshot.name;
    saveChain = saveChain.then(async () => {
      shell.setSaveState('saving', '自动保存中…');
      const saved = await projectRepository.saveProject(snapshot);
      if (saved.projectId !== game.sceneDocument.projectId) return;
      game.sceneDocument.updatedAt = saved.updatedAt;
      shell.setSaveState('saved', '已自动保存');
    }).catch((error) => shell.setSaveState('error', error.message));
  }

  editor.subscribe((event) => {
    syncTransformControls();
    shell.undoButton.disabled = !event.canUndo;
    shell.redoButton.disabled = !event.canRedo;
    renderSpaceTree();
    if (event.type !== 'selection') {
      if (lastAssetIds !== game.sceneDocument.assets.map((a) => a.id).join('|')) refreshAssets().catch((e) => shell.setUploadState('error', e.message));
      autosave();
    }
  });

  async function saveProject({ snapshot = false } = {}) {
    try {
      shell.setSaveState('saving', '保存中…');
      game.sceneDocument.name = shell.projectNameInput.value.trim() || '未命名客厅';
      await saveChain;
      const saved = await projectRepository.saveProject(game.sceneDocument);
      game.sceneDocument.updatedAt = saved.updatedAt;
      if (snapshot) await projectRepository.createSnapshot(saved.projectId);
      await projectPanel.refresh(saved.projectId);
      shell.setSaveState('saved', snapshot ? '已保存版本快照' : '已保存');
      return saved;
    } catch (error) {
      shell.setSaveState('error', error.message);
      throw error;
    }
  }

  async function openProject(projectId) {
    await saveChain;
    const next = prepareDocument(editableDocument(await projectRepository.loadProject(projectId)));
    if (next.projectId !== game.sceneDocument.projectId) aiPanel.reset();
    shell.setProjectName(next.name);
    editor.replaceSceneDocument(next);
    setViewMode('3d');
    showRoomOnly(Boolean(next.buildings[0].floors[0].rooms[0]?.designPalette));
    game.openingView();
    await refreshAssets();
    await projectPanel.refresh(projectId);
    shell.setSaveState('saved', '已重新打开项目');
    return next;
  }

  async function createProject() {
    let recentId;
    const selected = await createProjectWizard({ canCancel: true, catalogAssets: libraryIndex.assets, recentProjects: await projectRepository.listProjects(), onOpenApi: openAiSettings, onOpenRecent: (id) => { recentId = id; return openProject(id); } });
    if (recentId || !selected) return;
    const next = await projectRepository.createProject({ name: selected.name, sceneDocument: applyTemplateFinishes(selected) });
    await openProject(next.projectId);
    return next;
  }

  aiPanel.onCreateDesign=()=>createProject().catch(e=>shell.setUploadState('error',e.message));

  const projectPanel = new ProjectPanel({
    root: shell.projectPanel,
    projectRepository,
    onOpen: openProject,
    onCreate: createProject,
  });
  await projectPanel.mount();
  await projectPanel.refresh(sceneDocument.projectId);

  const report = error => shell.setUploadState('error', error.message);
  shell.root.querySelector('[data-action=export]').onclick = () => downloadDesign(game.sceneDocument,assetRepository).catch(report);
  shell.root.querySelector('[data-action=import]').onchange = async (event) => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      const scene = await readDesign(file, assetRepository, libraryIndex);
      const project = await projectRepository.createProject({ name: scene.name, sceneDocument: scene });
      await openProject(project.projectId);
      shell.root.querySelector('.dh-files').open = false;
    } catch (error) { report(error); }
  };
  shell.root.querySelector('[data-action=restore]').onclick = async () => {
    try {
      const [latest] = await projectRepository.listSnapshots(game.sceneDocument.projectId);
      if (!latest) return shell.setUploadState('info','此项目尚未保存版本。点击「保存项目」创建版本。');
      editor.runWithHistory(() => {
        game.replaceSceneDocument(prepareDocument(latest.sceneDocument));
        shell.setProjectName(game.sceneDocument.name);
        editor.selectPlacement(null);
      });
      shell.root.querySelector('.dh-files').open = false;
      shell.setUploadState('success','已恢复最近保存的版本，可撤销');
    } catch (error) { report(error); }
  };
  shell.saveButton.addEventListener('click', () => saveProject({ snapshot: true }));
  shell.undoButton.addEventListener('click', () => editor.undo());
  shell.redoButton.addEventListener('click', () => editor.redo());
  shell.projectNameInput.addEventListener('change', () => saveProject());
  shell.canvas.addEventListener('dragover', (event) => event.preventDefault());
  shell.canvas.addEventListener('drop', (event) => {
    event.preventDefault();
    const materialId = event.dataTransfer.getData('application/x-dreamhome-material');
    if (materialId) {
      const material = materialLibrary.activeMaterial?.id === materialId ? materialLibrary.activeMaterial : materialLibrary.materials.find((entry) => entry.id === materialId);
      if (!material) return;
      game.setPointer(event);
      const surface = game.pickSurface();
      if (surface?.type === 'placement') {
        const placement = game.sceneDocument.placements.find((entry) => entry.id === surface.placementId);
        if (placement) editor.setPlacementAppearance(placement.id, {}, material);
      } else if (surface?.roomId) {
        applyMaterialToRoom(material, surface.type === 'wall' ? 'wall' : 'floor', surface.roomId);
      }
      return;
    }
    const asset = editor.assets.find((entry) => entry.id === event.dataTransfer.getData('text/plain'));
    if (asset) {
      game.setPointer(event);
      const surface = game.pickSurface();
      try {
        const local = surface?.point?.clone().sub(game.originOf(surface.roomId));
        editor.addAsset(asset, local && surface.type === 'floor' ? { containerId: surface.roomId, position: { x: local.x, y: 0, z: local.z } } : {});
      } catch (error) { shell.setUploadState('error', error.message); }
    }
  });

  await refreshAssets();
  renderSpaceTree();
  shell.homeButton.addEventListener('click', () => createProject().catch((e) => shell.setUploadState('error', e.message)));
  shell.root.querySelector('[data-action=interior]').onclick = () => { setViewMode('3d'); game.interiorView(); };
  const stillButton=shell.root.querySelector('[data-action=still]');
  stillButton.hidden=!['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  stillButton.onclick=async()=>{if(shell.root.dataset.viewMode==='2d') setViewMode('3d'); const {renderInteriorStill}=await import('./ui/interior-still.js'); await renderInteriorStill(game);};
  shell.overviewButton.addEventListener('click', () => { setViewMode('3d'); game.showAllLevels = true; game.resetView(); });
  const cutaway = shell.root.querySelector('[data-action="cutaway"]');
  cutaway.addEventListener('click', () => {
    game.cutaway = !game.cutaway;
    cutaway.setAttribute('aria-pressed', String(game.cutaway));
  });
  game.onLoadError = (message) => shell.setUploadState('error', message);
  loading.remove();

  window.__dreamhome = {
    game,
    editor,
    executor,
    assetRepository,
    projectRepository,
    assetLibrary,
    aiPanel,
    shell,
    floorplan,
    setViewMode,
    roomEditor,
    saveProject,
    openProject,
    get sceneDocument() { return game.sceneDocument; },
  };
}

boot().catch((error) => {
  document.querySelector('.loading')?.remove();
  console.error(error);
  const message = document.createElement('div');
  message.className = 'dh-error';
  message.textContent = `DREAMHOME 启动失败：${error.message}`;
  document.body.appendChild(message);
});
