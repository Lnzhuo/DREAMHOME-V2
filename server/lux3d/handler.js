import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Lux3DProvider } from '../../src/providers/lux3d/node-provider.js';
import { getSessionId, getProviderEnvironment } from '../security/key-vault.mjs';
import { reservePlatform } from './budget.mjs';

const jobs = new Map();
const dataRoot = path.resolve('data');

async function providerForSession(sessionId) {
  return new Lux3DProvider({ env: await getProviderEnvironment(sessionId, 'aholo'), dataRoot });
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function bodyBytes(request, limit = 10 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('文件超过大小限制');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function bodyJson(request) {
  const bytes = await bodyBytes(request, 1024 * 1024);
  return JSON.parse(bytes.toString('utf8') || '{}');
}

async function persistJob(job) {
  await fs.mkdir(path.join(dataRoot, 'jobs'), { recursive: true });
  const serializable = { ...job, abortController: undefined, budget: undefined };
  await fs.writeFile(path.join(dataRoot, 'jobs', `${job.jobId}.json`), `${JSON.stringify(serializable, null, 2)}\n`);
}

function publicJob(job) {
  return { ...job, sessionId: undefined, abortController: undefined, budget: undefined, input: undefined };
}

async function runJob(job, provider) {
  try {
    job.status = 'processing';
    job.startedAt = new Date().toISOString();
    await persistJob(job);
    const taskId = job.input.mode === 'image_to_3d'
      ? await provider.createImageJob(job.input)
      : await provider.createTextJob(job.input);
    job.providerTaskId = String(taskId);
    await job.budget?.update({ taskId: String(taskId), status: 'submitted' });
    await persistJob(job);
    const result = await provider.waitForJob(taskId, { signal: job.abortController.signal });
    if (job.status === 'canceled') return;
    const asset = {
      id: `asset-${crypto.randomUUID()}`,
      name: job.input.name,
      category: job.input.category || 'furniture',
      source: job.input.mode === 'image_to_3d' ? 'lux3d_image' : 'lux3d_text',
      providerTaskId: String(taskId),
      sourceImageIds: job.input.uploadId ? [job.input.uploadId] : undefined,
      prompt: job.input.prompt,
      dimensions: job.input.dimensions,
      licenseStatus: 'user_owned',
      createdAt: new Date().toISOString(),
    };
    job.outputAsset = await provider.downloadAndArchive({ outputs: result.outputs, asset, projectId: job.input.projectId });
    job.status = 'succeeded';
    await job.budget?.update({ status: 'archived', asset: job.outputAsset });
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    await persistJob(job);
  } catch (error) {
    if (job.status !== 'canceled') {
      await job.budget?.update({ status: 'uncertain_or_failed' });
      job.status = 'failed';
      job.errorCode = 'Lux3DError';
      job.errorMessage = '生成或归档失败，请检查任务状态和账单';
      await persistJob(job);
    }
  } finally {
    if (job.status === 'canceled') await job.budget?.update({ status: 'uncertain_or_failed' });
    await job.budget?.release();
    job.budget = undefined;
  }
}

async function createJob(input, sessionId) {
  const provider = await providerForSession(sessionId);
  provider.assertConfigured();
  if (!input.name || !input.dimensions) {
    const error = new Error('资产名称和尺寸来源必填');
    error.status = 400;
    throw error;
  }
  if (provider.env.KEY_SOURCE === 'platform') { input.version = 'G1'; input.faceCount = 60000; }
  const budget = provider.env.KEY_SOURCE === 'platform' ? await reservePlatform(input.name) : undefined;
  const job = {
    budget,
    jobId: `job-${crypto.randomUUID()}`,
    sessionId,
    keySource: provider.env.KEY_SOURCE || 'platform',
    status: 'queued',
    progress: 0,
    retryCount: input.retryCount || 0,
    input,
    createdAt: new Date().toISOString(),
    abortController: new AbortController(),
  };
  jobs.set(job.jobId, job);
  try { await persistJob(job); } catch (error) { await budget?.release(); throw error; }
  runJob(job, provider);
  return job;
}

async function getJob(jobId) {
  if (jobs.has(jobId)) return jobs.get(jobId);
  try {
    const job = JSON.parse(await fs.readFile(path.join(dataRoot, 'jobs', `${jobId}.json`), 'utf8'));
    job.abortController = new AbortController();
    jobs.set(jobId, job);
    return job;
  } catch { return null; }
}

export async function handleLux3dRequest(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const host = (request.headers.host || '').toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  const allowed = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',').map((x) => x.trim().toLowerCase());
  const origin = request.headers.origin;
  if (!allowed.includes(hostname) || (origin && origin !== `http://${host}` && origin !== `https://${host}`)) return json(response, 403, { error: '来源不允许' });
  const sessionId = getSessionId(request, response);
  try {
    if (request.method === 'POST' && url.pathname === '/api/uploads/image') {
      const contentType = (request.headers['content-type'] || '').split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return json(response, 415, { error: '仅支持 JPG/PNG/WebP 图片' });
      const bytes = await bodyBytes(request);
      const uploadId = `upload-${crypto.randomUUID()}`;
      const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[contentType];
      const directory = path.join(dataRoot, 'uploads', uploadId);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, `source${extension}`), bytes, { flag: 'wx' });
      return json(response, 201, { uploadId, status: 'uploaded' });
    }

    if (request.method === 'POST' && ['/api/lux3d/image', '/api/lux3d/text'].includes(url.pathname)) {
      const input = await bodyJson(request);
      input.mode = url.pathname.endsWith('/image') ? 'image_to_3d' : 'text_to_3d';
      input.projectId ||= 'default';
      if (!/^[a-zA-Z0-9_-]+$/.test(input.projectId)) return json(response, 400, { error: 'projectId 格式无效' });
      if (input.mode === 'image_to_3d') {
        if (!/^upload-[a-f0-9-]+$/i.test(input.uploadId || '')) return json(response, 400, { error: 'uploadId 格式无效' });
        const uploadPath = path.join(dataRoot, 'uploads', input.uploadId);
        const files = await fs.readdir(uploadPath).catch(() => []);
        const source = files.find((file) => file.startsWith('source.'));
        if (!source) return json(response, 404, { error: '上传图片不存在' });
        input.filePath = path.join(uploadPath, source);
      } else if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
        return json(response, 400, { error: '文字生成需要 prompt' });
      }
      const job = await createJob(input, sessionId);
      return json(response, 202, publicJob(job));
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)(\/cancel|\/retry)?$/);
    if (jobMatch) {
      const job = await getJob(jobMatch[1]);
      if (!job || job.sessionId !== sessionId) return json(response, 404, { error: '任务不存在' });
      if (jobMatch[2] === '/cancel' && request.method === 'POST') {
        job.status = 'canceled';
        job.abortController.abort();
        job.providerCancellation = 'local_wait_only';
        await persistJob(job);
        return json(response, 200, publicJob(job));
      }
      if (jobMatch[2] === '/retry' && request.method === 'POST') {
        if (!['failed', 'canceled'].includes(job.status)) return json(response, 409, { error: '只有失败或取消任务可以重试' });
        const retryCount = (job.retryCount || 0) + 1;
        if (retryCount > 3) return json(response, 429, { error: '已达到最大重试次数' });
        job.sessionId ||= sessionId;
        const retry = await createJob({ ...job.input, retryCount }, job.sessionId);
        return json(response, 202, publicJob(retry));
      }
      if (request.method === 'GET') return json(response, 200, publicJob(job));
    }

    const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/model\.glb$/);
    if (assetMatch && request.method === 'GET') {
      if (!/^asset-[a-f0-9-]+$/i.test(assetMatch[1])) return json(response, 400, { error: 'assetId 格式无效' });
      const files = await fs.readdir(path.join(dataRoot, 'projects')).catch(() => []);
      for (const projectId of files) {
        const modelPath = path.join(dataRoot, 'projects', projectId, 'assets', assetMatch[1], 'model.glb');
        try {
          const stat = await fs.stat(modelPath);
          response.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': stat.size, 'Cache-Control': 'public, max-age=31536000, immutable' });
          response.end(await fs.readFile(modelPath));
          return true;
        } catch { continue; }
      }
      return json(response, 404, { error: '模型不存在' });
    }
    return false;
  } catch (error) {
    json(response, error.status || 500, { error: error.status && error.status < 500 ? error.message : '服务请求失败，请检查配置、网络和任务状态' });
    return true;
  }
}
