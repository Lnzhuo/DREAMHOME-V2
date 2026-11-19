export const IDB_MODEL_PREFIX = 'idb://assets/';

export const API_ROUTES = {
  health: '/api/health',
  uploadImage: '/api/uploads/image',
  lux3dImage: '/api/lux3d/image',
  lux3dText: '/api/lux3d/text',
  job: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}`,
  cancelJob: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/cancel`,
  retryJob: (jobId) => `/api/jobs/${encodeURIComponent(jobId)}/retry`,
  sceneCommand: '/api/ai/scene-command',
};

export const EDITOR_EVENTS = {
  CHANGE: 'change',
  SELECTION: 'selection',
  HISTORY: 'history',
};

// AssetRepository: init(), putAsset({asset,blob,thumbnailBlob}), getAsset(id), listAssets(), resolveAssetUrl(asset), deleteAsset(id).
// ProjectRepository: init(), listProjects(), createProject({name,sceneDocument}), saveProject(sceneDocument), loadProject(projectId), deleteProject(projectId), createSnapshot(projectId).
// EditorBridge: getSceneDocument(), replaceSceneDocument(), subscribe(), selectPlacement(), addAsset(), removePlacement(), replaceAsset(), updatePlacementTransform(), undo(), redo().
// SceneCommandExecutor: validatePlan(), preview(), apply(), undo(); plans contain summary/commands/questions/warnings/requiresConfirmation.
// Lux3DProvider: uploadImage(), createImageJob(), createTextJob(), getJob(), cancelJob(), retryJob(), waitForJob(), downloadAndArchive().
// Editor shell returns canvas/assetLibrary/spaceTree/propertyPanel/aiPanel/projectPanel/toolbar elements and save state controls.

export function getPrimaryRoomContext(sceneDocument) {
  for (const building of sceneDocument.buildings) {
    for (const floor of building.floors) {
      if (floor.rooms.length) return { building, floor, room: floor.rooms[0] };
    }
  }
  return null;
}

export function createPlacement({ id, assetId, containerId, position, rotation, scale }) {
  return {
    id,
    assetId,
    containerId,
    position: position || { x: 0, y: 0, z: 0 },
    rotation: rotation || { x: 0, y: 0, z: 0 },
    scale: scale || { x: 1, y: 1, z: 1 },
    locked: false,
    visible: true,
  };
}

export function cloneSceneDocument(sceneDocument) {
  return structuredClone(sceneDocument);
}
