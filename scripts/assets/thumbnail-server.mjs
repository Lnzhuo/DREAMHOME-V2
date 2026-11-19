import http from 'node:http';
import { createServer } from 'vite';
import { handleLibraryRequest } from '../../server/library.mjs';
if (process.env.DREAMHOME_THUMBNAIL_BUILD !== '1') throw Error('仅供离线缩略图构建使用');
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'spa' });
const server = http.createServer(async (req, res) => {
  if (req.url === '/api/health') { res.writeHead(200); res.end('ok'); return; }
  if (req.url.startsWith('/api/library/')) { await handleLibraryRequest(req, res); return; }
  vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
});
server.listen(Number(process.env.PORT), '127.0.0.1');
