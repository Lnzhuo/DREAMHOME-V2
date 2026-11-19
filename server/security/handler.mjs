import { assertByokUrl } from './llm-network.mjs';
import { getSessionId, getPublicStatus, saveSecrets, deleteSecrets, testAholo, testLlm, setSource } from './key-vault.mjs';

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('请求过大');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export async function handleSettingsRequest(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const host = (request.headers.host || '').toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  const allowed = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',').map((x) => x.trim().toLowerCase());
  if (!allowed.includes(hostname)) return json(response, 403, { error: '主机不允许' });
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) return json(response, 403, { error: '来源不允许' });
  const sessionId = getSessionId(request, response);
  try {
    if (request.method === 'POST' && url.pathname === '/api/settings/source') {
      const input = await bodyJson(request);
      await setSource(sessionId, input.provider, input.source);
      return json(response, 200, await getPublicStatus(sessionId));
    }
    if (request.method === 'GET' && url.pathname === '/api/settings/status') {
      return json(response, 200, await getPublicStatus(sessionId));
    }
    if (request.method === 'POST' && url.pathname === '/api/settings/aholo') {
      const input = await bodyJson(request);
      if (!input.apiKey || !['cn', 'com'].includes(input.region || 'cn')) return json(response, 400, { error: 'Aholo Key 或区域无效' });
      await saveSecrets(sessionId, 'aholo', { apiKey: input.apiKey, region: input.region || 'cn' });
      return json(response, 200, await getPublicStatus(sessionId));
    }
    if (request.method === 'DELETE' && url.pathname === '/api/settings/aholo') {
      await deleteSecrets(sessionId, 'aholo');
      return json(response, 200, await getPublicStatus(sessionId));
    }
    if (request.method === 'POST' && url.pathname === '/api/settings/aholo/test') {
      return json(response, 200, await testAholo(sessionId));
    }
    if (request.method === 'POST' && url.pathname === '/api/settings/llm') {
      const input = await bodyJson(request);
      if (!input.apiKey || !input.baseUrl || !input.model) return json(response, 400, { error: 'LLM Key、Base URL 和 Model 必填' });
      let target;
      try { target = new URL(input.baseUrl); } catch { return json(response, 400, { error: 'Base URL 无效' }); }
      try { assertByokUrl(input.baseUrl); } catch { return json(response, 400, { error: '个人 LLM 地址必须为公网 HTTPS 服务' }); }
      if (target.username || target.password || target.search || target.hash) return json(response, 400, { error: 'Base URL 不能包含凭据、查询参数或片段' });
      await saveSecrets(sessionId, 'llm', { apiKey: input.apiKey, baseUrl: input.baseUrl, model: input.model });
      return json(response, 200, await getPublicStatus(sessionId));
    }
    if (request.method === 'DELETE' && url.pathname === '/api/settings/llm') {
      await deleteSecrets(sessionId, 'llm');
      return json(response, 200, await getPublicStatus(sessionId));
    }
    if (request.method === 'POST' && url.pathname === '/api/settings/llm/test') {
      return json(response, 200, await testLlm(sessionId));
    }
    return false;
  } catch (error) {
    return json(response, error.status || 502, { error: error.status && error.status < 500 ? error.message : '设置操作失败，请检查配置与网络' });
  }
}
