import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleAiRequest } from '../server/ai/handler.js';
import { getSessionId, saveSecrets, getSecrets, getPublicStatus, setSource, getProviderEnvironment, deleteSecrets } from '../server/security/key-vault.mjs';
function open(cookie = '') { let header; const id = getSessionId({ headers: { cookie } }, { setHeader: (_, value) => { header = value; } }); return { id, cookie: header?.split(';')[0] }; }
test('session vault isolates keys, supports explicit source selection and deletion', async () => {
  const a = open(), b = open();
  await saveSecrets(a.id, 'llm', { apiKey: 'test-secret', baseUrl: 'https://example.test/v1', model: 'model' });
  assert.equal((await getSecrets(b.id, 'llm')).apiKey, undefined);
  assert.equal((await getProviderEnvironment(a.id, 'llm')).LLM_API_KEY, 'test-secret');
  assert.ok(!JSON.stringify(await getPublicStatus(a.id)).includes('test-secret'));
  await setSource(a.id, 'llm', 'platform');
  assert.notEqual((await getProviderEnvironment(a.id, 'llm')).LLM_API_KEY, 'test-secret');
  await setSource(a.id, 'llm', 'byok');
  await deleteSecrets(a.id, 'llm');
  assert.equal((await getSecrets(a.id, 'llm')).apiKey, undefined);
  assert.equal(open(a.cookie).id, a.id);
  assert.notEqual(open('dh_session=' + 'a'.repeat(64)).id, 'a'.repeat(64));
});

test('personal LLM endpoints reject local and private addresses', async () => {
  const { assertByokUrl, safeByokFetch } = await import('../server/security/llm-network.mjs');
  for (const url of ['http://127.0.0.1:1234/v1','https://localhost/v1','https://127.0.0.1/v1','https://10.1.2.3/v1','https://[::1]/v1']) assert.throws(() => assertByokUrl(url));
  assert.doesNotThrow(() => assertByokUrl('https://provider.example/v1'));
  await assert.rejects(() => safeByokFetch('https://192.168.1.1/v1'));
});

test('scene commands stop when the session has switched away from the displayed API source', async () => {
  const request = Readable.from([Buffer.from(JSON.stringify({
    message: '调整墙面颜色', sceneDocument: {}, serviceSource: 'byok',
  }))]);
  Object.assign(request, { method: 'POST', url: '/api/ai/scene-command', headers: { host: 'localhost' } });
  let status, body;
  await handleAiRequest(request, {
    setHeader() {},
    writeHead(code) { status = code; },
    end(content) { body = JSON.parse(content); },
  });
  assert.equal(status, 409);
  assert.match(body.error, /API 服务已切换或会话已到期/);
});

test('personal LLM DNS cannot resolve to private network', async () => {
  const dns = (await import('node:dns')).default;
  const previous = dns.lookup;
  dns.lookup = (_hostname, _options, callback) => callback(null, [{address:'192.168.1.5', family:4}]);
  try { const {safeByokFetch} = await import('../server/security/llm-network.mjs'); await assert.rejects(() => safeByokFetch('https://example.test/v1'), /内网/); }
  finally { dns.lookup = previous; }
});
