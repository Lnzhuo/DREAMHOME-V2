import { IDB_MODEL_PREFIX } from '../core/api-contracts.js';

const DB_VERSION = 1;
const databases = new Map();

function request(idbRequest) {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(idbRequest.error);
  });
}

function openDatabase(name) {
  if (!databases.has(name)) {
    databases.set(name, new Promise((resolve, reject) => {
      const open = indexedDB.open(name, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'projectId' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapshots.createIndex('projectId', 'projectId');
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    }));
  }
  return databases.get(name);
}

function put(db, store, value) {
  return request(db.transaction(store, 'readwrite').objectStore(store).put(value));
}

function get(db, store, key) {
  return request(db.transaction(store, 'readonly').objectStore(store).get(key));
}

function getAll(db, store) {
  return request(db.transaction(store, 'readonly').objectStore(store).getAll());
}

function remove(db, store, key) {
  return request(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export class AssetRepository {
  constructor({ dbName = 'dreamhome' } = {}) {
    this.dbName = dbName;
    this.objectUrls = new Map();
  }

  async init() {
    this.db = await openDatabase(this.dbName);
    return this;
  }

  async putAsset({ asset, blob, thumbnailBlob }) {
    const stored = structuredClone(asset);
    stored.id ||= `asset-${crypto.randomUUID()}`;
    stored.createdAt ||= new Date().toISOString();
    if (blob) {
      if (this.objectUrls.has(stored.id)) URL.revokeObjectURL(this.objectUrls.get(stored.id));
      this.objectUrls.delete(stored.id);
      stored.modelUrl = `${IDB_MODEL_PREFIX}${stored.id}/model.glb`;
      await put(this.db, 'blobs', { id: stored.id, blob, thumbnailBlob, storedAt: Date.now() });
    }
    await put(this.db, 'assets', stored);
    return stored;
  }

  async getAsset(id) {
    return get(this.db, 'assets', id);
  }

  async listAssets() {
    return getAll(this.db, 'assets');
  }

  async getAssetBlob(id) {
    return (await get(this.db, 'blobs', id))?.blob || null;
  }

  async putReference(blob) {
    const id = 'reference-' + crypto.randomUUID();
    await put(this.db, 'blobs', { id, blob, storedAt: Date.now() });
    return id;
  }

  async resolveAssetUrl(asset) {
    if (!asset.modelUrl?.startsWith(IDB_MODEL_PREFIX)) return asset.modelUrl;
    if (this.objectUrls.has(asset.id)) return this.objectUrls.get(asset.id);
    const blob = await this.getAssetBlob(asset.id);
    if (!blob) throw new Error(`本地模型不存在：${asset.name || asset.id}`);
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(asset.id, url);
    return url;
  }

  async deleteAsset(id) {
    await remove(this.db, 'assets', id);
    await remove(this.db, 'blobs', id);
  }

  revokeUrls() {
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}

export class ProjectRepository {
  constructor({ dbName = 'dreamhome' } = {}) {
    this.dbName = dbName;
    this.saveTimer = null;
  }

  async init() {
    this.db = await openDatabase(this.dbName);
    return this;
  }

  async createProject({ name, sceneDocument }) {
    const next = structuredClone(sceneDocument);
    next.projectId = `project-${crypto.randomUUID()}`;
    next.name = name || next.name || '未命名客厅';
    return this.saveProject(next);
  }

  async saveProject(sceneDocument) {
    const next = structuredClone(sceneDocument);
    next.updatedAt = new Date().toISOString();
    await put(this.db, 'projects', next);
    return next;
  }

  async loadProject(projectId) {
    const sceneDocument = await get(this.db, 'projects', projectId);
    if (!sceneDocument) throw new Error('项目不存在或已删除');
    return sceneDocument;
  }

  async listProjects() {
    return (await getAll(this.db, 'projects')).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  async deleteProject(projectId) {
    await remove(this.db, 'projects', projectId);
    const snapshots = await this.listSnapshots(projectId);
    await Promise.all(snapshots.map((snapshot) => remove(this.db, 'snapshots', snapshot.id)));
  }

  async createSnapshot(projectId) {
    const sceneDocument = await this.loadProject(projectId);
    const snapshot = { id: `snapshot-${crypto.randomUUID()}`, projectId, createdAt: new Date().toISOString(), sceneDocument };
    await put(this.db, 'snapshots', snapshot);
    return snapshot;
  }

  async listSnapshots(projectId) {
    const snapshots = await request(this.db.transaction('snapshots', 'readonly').objectStore('snapshots').index('projectId').getAll(projectId));
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  autosave(sceneDocument, delay = 700) {
    clearTimeout(this.saveTimer);
    return new Promise((resolve, reject) => {
      this.saveTimer = setTimeout(async () => {
        try { resolve(await this.saveProject(sceneDocument)); } catch (error) { reject(error); }
      }, delay);
    });
  }
}
