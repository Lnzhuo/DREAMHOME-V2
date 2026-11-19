import { safeByokFetch } from './llm-network.mjs';
import { createLux3dClient } from '@manycore/aholo-sdk-lux3d';
import crypto from 'node:crypto';

// Session-only vault: a process restart destroys both ciphertext and its key.
const key = crypto.randomBytes(32);
const sessions = new Map();
const lifetime = 24 * 60 * 60 * 1000;
function session(id) {
  const item = sessions.get(id);
  if (!item || item.expires <= Date.now()) { sessions.delete(id); return null; }
  item.expires = Date.now() + lifetime;
  return item;
}
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { iv, data, tag: cipher.getAuthTag() };
}
function decrypt(value) {
  if (!value) return {};
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.iv);
  cipher.setAuthTag(value.tag);
  return JSON.parse(Buffer.concat([cipher.update(value.data), cipher.final()]).toString('utf8'));
}
export function getSessionId(request, response) {
  const match = (request.headers.cookie || '').match(/(?:^|;\s*)dh_session=([a-f0-9]{64})(?:;|$)/);
  if (match && session(match[1])) return match[1];
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { expires: Date.now() + lifetime, providers: {}, sources: {} });
  response.setHeader('Set-Cookie', `dh_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
  return id;
}
export async function saveSecrets(id, provider, secrets) {
  const item = session(id); if (!item) throw new Error('会话已过期');
  item.providers[provider] = encrypt(secrets); item.sources[provider] = 'byok';
}
export async function deleteSecrets(id, provider) {
  const item = session(id); if (!item) return;
  delete item.providers[provider]; item.sources[provider] = 'platform';
}
export async function setSource(id, provider, source) {
  const item = session(id); if (!item) throw new Error('会话已过期');
  if (!['aholo', 'llm'].includes(provider) || !['platform', 'byok'].includes(source)) throw new Error('服务来源无效');
  if (source === 'byok' && !item.providers[provider]) throw new Error('请先保存个人 Key');
  item.sources[provider] = source;
}
export async function getSecrets(id, provider) { return decrypt(session(id)?.providers[provider]); }
export async function getPublicStatus(id) {
  const item = session(id); const aholo = await getSecrets(id, 'aholo'); const llm = await getSecrets(id, 'llm');
  return {
    aholo: { configured: !!aholo.apiKey, platformConfigured: !!process.env.AHOLO_API_KEY, keyMask: aholo.apiKey ? '••••' : '', region: aholo.region || 'cn', source: item?.sources.aholo || 'platform' },
    llm: { configured: !!llm.apiKey, platformConfigured: !!(process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL), keyMask: llm.apiKey ? '••••' : '', baseUrl: llm.baseUrl || '', model: llm.model || '', source: item?.sources.llm || 'platform' },
  };
}
export async function getProviderEnvironment(id, provider) {
  const item = session(id); const source = item?.sources[provider] || 'platform';
  const secrets = source === 'byok' ? await getSecrets(id, provider) : {};
  if (provider === 'aholo') return { ...process.env, AHOLO_API_KEY: source === 'byok' ? secrets.apiKey : process.env.AHOLO_API_KEY, AHOLO_REGION: source === 'byok' ? secrets.region : process.env.AHOLO_REGION || 'cn', LUX3D_ALLOW_PAID_GENERATION: source === 'byok' ? 'true' : process.env.LUX3D_ALLOW_PAID_GENERATION, KEY_SOURCE: source };
  return { ...process.env, LLM_API_KEY: source === 'byok' ? secrets.apiKey : process.env.LLM_API_KEY, LLM_BASE_URL: source === 'byok' ? secrets.baseUrl : process.env.LLM_BASE_URL, LLM_MODEL: source === 'byok' ? secrets.model : process.env.LLM_MODEL, LLM_SOURCE: source };
}
export async function testAholo(id) {
  const env = await getProviderEnvironment(id, 'aholo');
  if (!env.AHOLO_API_KEY) throw new Error('Aholo 未配置');
  const client = createLux3dClient({ region: env.AHOLO_REGION, apiKey: env.AHOLO_API_KEY });
  await client.tasks.list({ page: 1, pageSize: 1 });
  return { authenticated: true, region: env.AHOLO_REGION };
}
export async function testLlm(id) {
  const env = await getProviderEnvironment(id, 'llm');
  if (!env.LLM_API_KEY || !env.LLM_BASE_URL || !env.LLM_MODEL) throw new Error('LLM 未配置');
  const response = await (env.LLM_SOURCE === 'byok' ? safeByokFetch : fetch)(`${env.LLM_BASE_URL.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${env.LLM_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`LLM /models 返回 HTTP ${response.status}`);
  return { authenticated: true, model: env.LLM_MODEL };
}
