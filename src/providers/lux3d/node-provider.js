import { createLux3dClient } from '@manycore/aholo-sdk-lux3d';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class Lux3DProvider {
  constructor({ env = process.env, dataRoot = path.resolve('data'), fetchImpl = fetch } = {}) {
    this.env = env;
    this.dataRoot = dataRoot;
    this.fetchImpl = fetchImpl;
  }

  assertConfigured() {
    if (!this.env.AHOLO_API_KEY) {
      const error = new Error('未配置服务端 AHOLO_API_KEY');
      error.status = 503;
      throw error;
    }
    if (this.env.LUX3D_ALLOW_PAID_GENERATION !== 'true') {
      const error = new Error('真实 Lux3D 费用与额度尚未确认；核实后设置 LUX3D_ALLOW_PAID_GENERATION=true 才能生成');
      error.status = 503;
      throw error;
    }
  }

  client() {
    this.assertConfigured();
    return createLux3dClient({ region: this.env.AHOLO_REGION || 'cn', apiKey: this.env.AHOLO_API_KEY });
  }

  async createImageJob({ filePath, version = 'G1', faceCount = 60_000, quoteId }) {
    const body = {version,faceCount,outputFormat:['glb'],aiPredictSize:false,...(quoteId ? {content_id:quoteId} : {})};
    const images = this.client().imgTo3d;
    return images.createFromFile(filePath,body);
  }

  async createTextJob({ prompt, version = 'G1', faceCount = 60_000, quoteId }) {
    return this.client().textTo3d.create({ prompt, version, faceCount, outputFormat: ['glb'], aiPredictSize: false, ...(quoteId ? {content_id:quoteId} : {}) });
  }

  async getJob(taskId) {
    return this.client().tasks.retrieve(taskId);
  }

  async waitForJob(taskId, { signal, timeoutMs = 20 * 60 * 1000 } = {}) {
    return this.client().tasks.waitFor(taskId, { intervalMs: 10_000, timeoutMs, signal });
  }

  async cancelJob() {
    return { providerCancellation: 'not_supported_by_installed_sdk', localWaitCanceled: true };
  }

  async downloadAndArchive({ outputs, asset, projectId = 'default' }) {
    const candidate = outputs?.find((item) => typeof item?.content === 'string' && (/\.glb(?:\?|$)/i.test(item.content) || item.format === 'glb' || item.type === 'glb'));
    if (!candidate) throw new Error('Lux3D 结果没有可识别的 GLB 下载项');
    const response = await this.fetchImpl(candidate.content);
    if (!response.ok) throw new Error(`GLB 下载失败 HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return this.archiveGlb({ bytes, asset, projectId });
  }

  async archiveGlb({ bytes, asset, projectId = 'default' }) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > 500 * 1024 * 1024 || bytes.toString('ascii', 0, 4) !== 'glTF') {
      throw new Error('下载结果不是有效 GLB 文件');
    }
    const directory = path.join(this.dataRoot, 'projects', projectId, 'assets', asset.id);
    await fs.mkdir(directory, { recursive: true });
    const modelPath = path.join(directory, 'model.glb');
    const temporary = `${modelPath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, bytes, { flag: 'wx' });
    await fs.rename(temporary, modelPath);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const archived = {
      ...asset,
      provider: 'aholo-lux3d',
      modelUrl: `/api/assets/${asset.id}/model.glb`,
      archive: { storage: 'local_server', bytes: bytes.length, sha256, archivedAt: new Date().toISOString() },
    };
    await fs.writeFile(path.join(directory, 'asset.json'), `${JSON.stringify(archived, null, 2)}\n`);
    return archived;
  }
}
