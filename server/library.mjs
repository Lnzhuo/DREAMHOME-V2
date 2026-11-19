import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve('data', 'library');
const TYPES = { '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.hdr': 'application/octet-stream' };

function safeFile(pathname) {
  const file = path.normalize(path.join(ROOT, pathname));
  return file === ROOT || file.startsWith(`${ROOT}${path.sep}`) ? file : null;
}

export async function handleLibraryRequest(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/api/library/thumbnails' && request.method === 'POST') {
    const remote = request.socket.remoteAddress;
    const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    const origin = request.headers.origin;
    if (process.env.DREAMHOME_THUMBNAIL_BUILD !== '1' || !local || !origin || origin !== `http://${request.headers.host}`) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: '仅本机离线缩略图构建可写入' }));
      return true;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 6 * 1024 * 1024) {
        response.writeHead(413, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: '缩略图过大' }));
        return true;
      }
      chunks.push(chunk);
    }
    try {
      const { assetId, data, kind = 'thumbnail' } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!['thumbnail', 'plan'].includes(kind) || !/^[a-zA-Z0-9_-]+$/.test(assetId || '') || !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(data || '')) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'assetId 或 PNG 数据无效' }));
        return true;
      }
      const bytes = Buffer.from(data.split(',')[1], 'base64');
      const width = bytes.length >= 24 ? bytes.readUInt32BE(16) : 0, height = bytes.length >= 24 ? bytes.readUInt32BE(20) : 0;
      const validSize = kind === 'plan' ? width > 0 && height > 0 && Math.max(width, height) === 512 : width === 512 && height === 512;
      if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || !validSize) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: '必须是 512×512 PNG 文件' }));
        return true;
      }
      const directory = path.join(ROOT, 'models', assetId);
      const metadataPath = path.join(directory, 'asset.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      const filename = kind === 'plan' ? 'plan.png' : 'thumbnail.png';
      const thumbnailPath = path.join(directory, filename);
      const temporary = `${thumbnailPath}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, bytes, { flag: 'wx' });
      await fs.rename(temporary, thumbnailPath);
      const url = `/api/library/models/${assetId}/${filename}`;
      const info = { width, height, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), createdAt: new Date().toISOString() };
      if (kind === 'plan') { metadata.planThumbnailUrl = url; metadata.planThumbnail = { ...info, view: '+Y', up: '-Z', right: '+X', projection: 'orthographic' }; }
      else { metadata.thumbnailUrl = url; metadata.thumbnail = info; }
      const metadataTemp = `${metadataPath}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(metadataTemp, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
      await fs.rename(metadataTemp, metadataPath);
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ thumbnailUrl: url }));
      return true;
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
      return true;
    }
  }

  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: '不支持的请求方法' })); return true; }
  const relative = url.pathname.replace('/api/library/', '');
  if (relative === 'index.json') {
    const bytes = await fs.readFile(path.join(ROOT, 'index.json'));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(bytes);
    return true;
  }
  if (!/^(models\/[a-zA-Z0-9_-]+\/(model\.glb|asset\.json|thumbnail\.png|plan\.png|reference-input\.jpg)|materials\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_]+\.(jpg|json)|room-references\/[a-zA-Z0-9_-]+\.jpg|hdris\/[a-zA-Z0-9_-]+\.(hdr|json))$/.test(relative)) { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: '资源不存在' })); return true; }
  const file = safeFile(relative);
  if (!file) return false;
  try {
    const bytes = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
    response.end(bytes);
    return true;
  } catch {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: '资源不存在' }));
    return true;
  }
}
