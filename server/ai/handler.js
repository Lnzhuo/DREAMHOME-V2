import { safeByokFetch } from '../security/llm-network.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateSceneCommandPlan, SceneCommandExecutor } from '../../src/ai/scene-command.js';
import { getSessionId, getProviderEnvironment } from '../security/key-vault.mjs';

function selectCandidates(entries, message, limit) {
  const query = message.toLowerCase();
  const score = (item) => {
    const text = `${item.name || ''} ${item.category || ''} ${item.id || ''}`.toLowerCase();
    let value = query.includes(String(item.id || '').toLowerCase()) && item.id ? 100 : 0;
    for (let i=0; i<query.length-1; i++) if (text.includes(query.slice(i, i+2))) value += 2;
    return value;
  };
  const ranked = entries.map((entry, index) => ({ entry, index, score: score(entry) })).sort((a,b) => b.score-a.score || a.index-b.index);
  const selected = ranked.filter((item) => item.score > 0).slice(0, limit);
  const used = new Set(selected.map((item) => item.entry.id));
  const groups = new Set(selected.map((item) => item.entry.category));
  for (const item of ranked) { if (selected.length >= limit) break; if (!used.has(item.entry.id) && !groups.has(item.entry.category)) { selected.push(item); used.add(item.entry.id); groups.add(item.entry.category); } }
  for (const item of ranked) { if (selected.length >= limit) break; if (!used.has(item.entry.id)) { selected.push(item); used.add(item.entry.id); } }
  return selected.map((item) => item.entry);
}
function systemPrompt(sceneDocument, catalog = {}, message = '', selection = {}) {
  const dims = a => ['width','depth','height'].map(k=>Number(a.dimensions?.[k]?.value?.toFixed(2))||null);
  const vec = v => Object.fromEntries(Object.entries(v).map(([k,n])=>[k,Number(n.toFixed(3))]));
  const context = {
    currentRoom: selection.roomId, selectedFurniture: selection.placementId,
    rooms: sceneDocument.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.map((room) => ({ id: room.id, name: room.name, boundary:room.boundary })))),
    assets: sceneDocument.assets.map((asset) => ({ id: asset.id, name: asset.name, category: asset.category, dimensions: dims(asset) })),
    libraryAssets: selectCandidates(catalog.assets || [], message, 15).map(a => ({ id:a.id, name:a.name, size:dims(a) })),
    sceneMaterials: selectCandidates(sceneDocument.materials || [], message, 8).map(({ id, name, category }) => ({ id, name, category })),
    libraryMaterials: selectCandidates(catalog.materials || [], message, 8).map(({ id, name, category }) => ({ id, name, category })),
    placements: sceneDocument.placements.map((placement) => ({ id: placement.id, assetId: placement.assetId, room: placement.containerId, position: vec(placement.position), rotation: vec(placement.rotation) })),
  };
  return `你是家居设计命令生成器。只返回 JSON：summary,commands,questions,warnings,requiresConfirmation。commands 中每个对象必须含 type 字段，例如 {"type":"place_asset","assetId":"目录中的资产ID","containerId":"房间ID"}。命令仅允许 place_asset{assetId,containerId,position?}, move_asset{placementId,offset或position}, rotate_asset{placementId,rotation}, replace_asset{placementId,newAssetId}, set_material{targetId,color? or materialId?,surface?}，targetId 可为家具实例或房间 ID，房间必须提供 surface 为 wall 或 floor。坐标米、Y-up、旋转弧度。只能使用上下文真实 ID，目标不明确或参数不足必须放入 questions，commands 留空。requiresConfirmation 必须为 true。每条命令用 type 指定操作，位置、旋转均为含 x、y、z 三个数字的对象，相对位移必须用 offset，不用 position，程序会把增量加到当前位置。例如“向右20厘米”应生成 {"type":"move_asset","placementId":"实例ID","offset":{"x":0.2,"y":0,"z":0}}。只有用户指定绝对坐标才用 position。向右为 +X。提供建议时写入 summary；无需执行则 commands=[]。有图片时依据画面中可见内容。上下文：${JSON.stringify(context)}`;
}

export async function generateSceneCommand({ message, image, sceneDocument, selection = {}, catalog = {}, fetchImpl = fetch, env = process.env }) {
  if (!env.LLM_API_KEY || !env.LLM_BASE_URL || !env.LLM_MODEL) {
    const error = new Error('真实 LLM 服务未配置（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）');
    error.status = 503;
    throw error;
  }
  const request = env.LLM_SOURCE === 'byok' && fetchImpl === fetch ? safeByokFetch : fetchImpl;
  const response = await request(`${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages: [{ role: 'system', content: systemPrompt(sceneDocument, catalog, message, selection) }, { role: 'user', content: image ? [{ type: 'text', text: message }, { type: 'image_url', image_url: { url: image } }] : message }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1200,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(env.LLM_SOURCE !== 'byok' && /^http:\/\/(127\.0\.0\.1|localhost):/.test(env.LLM_BASE_URL) ? 300_000 : 45_000),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(`LLM 请求失败：HTTP ${response.status}`);
    error.status = 502;
    throw error;
  }
  const content = body.choices?.[0]?.message?.content;
  let plan;
  try { plan = JSON.parse(content); } catch {
    const error = new Error('LLM 未返回有效 JSON');
    error.status = 502;
    throw error;
  }
  // Normalize the model's relative command to the canonical absolute scene contract.
  // The UI must still preview and confirm the resolved destination.
  for (const cmd of Array.isArray(plan?.commands) ? plan.commands : []) {
    if (cmd?.type!=='move_asset' || !cmd.offset) continue;
    const placed=sceneDocument.placements.find(p=>p.id===cmd.placementId);
    const axes=['x','y','z'];
    if (!placed || cmd.position || !axes.every(k=>Number.isFinite(cmd.offset[k]))) {
      const error=new Error('相对位移需要有效的家具和唯一的三轴增量'); error.status=502; throw error;
    }
    cmd.position=Object.fromEntries(axes.map(k=>[k,Number((placed.position[k]+cmd.offset[k]).toFixed(6))]));
    delete cmd.offset;
  }
  const validation = validateSceneCommandPlan(plan);
  if (!validation.valid) {
    const error = new Error(`LLM SceneCommand 校验失败：${validation.errors[0].message}`);
    error.status = 502;
    throw error;
  }
  const executor = new SceneCommandExecutor({ getSceneDocument: () => sceneDocument });
  executor.catalog = catalog;
  const preview = executor.preview(plan);
  if (preview.errors.length) { const error = new Error('LLM 命令引用不存在或不合法'); error.status = 502; throw error; }
  return plan;
}

export async function handleAiRequest(request, response) {
  if (request.method !== 'POST') return false;
  const host = (request.headers.host || '').toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  const allowed = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]').split(',').map((x) => x.trim().toLowerCase());
  if (!allowed.includes(hostname)) { response.writeHead(403); response.end(); return true; }
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) { response.writeHead(403); response.end(); return true; }
  const sessionId = getSessionId(request, response);
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 5 * 1024 * 1024) { const error = new Error('请求过大'); error.status = 413; throw error; } chunks.push(chunk); }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof input.message !== 'string' || !input.message.trim() || !input.sceneDocument) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'message 和 sceneDocument 必填' }));
      return true;
    }
    if (input.image && (typeof input.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.image))) { const error = new Error('图片格式无效'); error.status = 400; throw error; }
    const catalog = JSON.parse(await fs.readFile(path.resolve('data/library/index.json'), 'utf8'));
    const plan = await generateSceneCommand({ message: input.message, image: input.image, sceneDocument: input.sceneDocument, selection: { roomId:input.selection?.roomId, placementId:input.selection?.placementId }, catalog, env: await getProviderEnvironment(sessionId, 'llm') });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(plan));
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.cause?.code === 'UND_ERR_HEADERS_TIMEOUT';
    const status = timedOut ? 504 : error.status || 500;
    response.writeHead(status, { 'Content-Type': 'application/json' });
    const message = timedOut ? '模型响应超时，可缩短指令或稍后再试' : (error.status && (error.status < 500 || error.status === 503) ? error.message : 'AI 请求失败，请检查配置与网络');
    response.end(JSON.stringify({ error: message }));
  }
  return true;
}
