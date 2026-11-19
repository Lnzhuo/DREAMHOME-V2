import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleLux3dRequest } from './lux3d/handler.js';
import { handleAiRequest } from './ai/handler.js';
import { handleLibraryRequest } from './library.mjs';
import { handleSettingsRequest } from './security/handler.mjs';
import { loadServerEnv } from './env.mjs';

const dev = process.argv.includes('--dev');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await loadServerEnv(root);
const dist = path.resolve(process.env.DIST_DIR || path.join(root, 'dist'));
const vite = dev ? await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'spa' }) : null;

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };

async function serveStatic(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let filePath = path.normalize(path.join(dist, pathname === '/' ? 'index.html' : pathname));
  if (filePath !== dist && !filePath.startsWith(dist + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const bytes = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(bytes);
  } catch {
    const bytes = await fs.readFile(path.join(dist, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(bytes);
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', application: 'DREAMHOME V2', lux3dConfigured: Boolean(process.env.AHOLO_API_KEY), lux3dPaidGenerationAllowed: process.env.LUX3D_ALLOW_PAID_GENERATION === 'true', llmConfigured: Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL) }));
      return;
    }
    if (pathname.startsWith('/api/settings/')) {
      if (await handleSettingsRequest(request, response) === false && !response.writableEnded) { response.writeHead(404); response.end(); }
      return;
    }
    if (pathname.startsWith('/api/library/')) {
      if (!await handleLibraryRequest(request, response) && !response.writableEnded) { response.writeHead(404); response.end(); }
      return;
    }
    if (pathname === '/api/ai/scene-command') {
      await handleAiRequest(request, response);
      return;
    }
    if (pathname.startsWith('/api/')) {
      const handled = await handleLux3dRequest(request, response);
      if (!handled && !response.writableEnded) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'API 不存在' }));
      }
      return;
    }
    if (vite) vite.middlewares(request, response, () => {});
    else await serveStatic(request, response);
  } catch (error) {
    if (!response.writableEnded) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => {
  console.log(`DREAMHOME ${dev ? 'development' : 'production'} server: http://127.0.0.1:${port}`);
});
