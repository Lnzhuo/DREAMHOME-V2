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
function systemPrompt(sceneDocument, catalog = {}, message = '', selection = {}, scopeNote = '') {
  const dims = a => ['width','depth','height'].map(k=>Number(a.dimensions?.[k]?.value?.toFixed(2))||null);
  const vec = v => Object.fromEntries(Object.entries(v).map(([k,n])=>[k,Number(n.toFixed(3))]));
  const context = {
    currentRoom: selection.roomId, selectedFurniture: selection.placementId,
    rooms: sceneDocument.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.map((room) => ({ id: room.id, name: room.name, boundary:room.boundary })))),
    assets: sceneDocument.assets.map((asset) => ({ id: asset.id, name: asset.name, category: asset.category, dimensions: dims(asset) })),
    libraryAssets: selectCandidates(catalog.assets || [], message, scopeNote ? 6 : 15).map(a => ({ id:a.id, name:a.name, size:dims(a) })),
    sceneMaterials: selectCandidates(sceneDocument.materials || [], message, scopeNote ? 4 : 8).map(({ id, name, category }) => ({ id, name, category })),
    libraryMaterials: selectCandidates(catalog.materials || [], message, scopeNote ? 4 : 8).map(({ id, name, category }) => ({ id, name, category })),
    placements: sceneDocument.placements.map((placement) => ({ id: placement.id, assetId: placement.assetId, room: placement.containerId, position: vec(placement.position), rotation: vec(placement.rotation) })),
  };
  if (scopeNote) context.scope = scopeNote+' 只执行明确定位且在清单中的操作。需要检查未列出的房间或物件时，请提问并返回空命令。';
  return `你是家居设计命令生成器。只返回 JSON：summary,commands,questions,warnings,requiresConfirmation。commands 中每个对象必须含 type 字段，例如 {"type":"place_asset","assetId":"目录中的资产ID","containerId":"房间ID"}。命令仅允许 place_asset{assetId,containerId,position?}, move_asset{placementId,offset或position}, rotate_asset{placementId,rotation}, replace_asset{placementId,newAssetId}, set_material{targetId,color? or materialId?,surface?}，targetId 可为家具实例或房间 ID，房间必须提供 surface 为 wall 或 floor。坐标米、Y-up、旋转弧度。只能使用上下文真实 ID，目标不明确或参数不足必须放入 questions，commands 留空。requiresConfirmation 必须为 true。每条命令用 type 指定操作，位置、旋转均为含 x、y、z 三个数字的对象，相对位移必须用 offset，不用 position，程序会把增量加到当前位置。例如“向右20厘米”应生成 {"type":"move_asset","placementId":"实例ID","offset":{"x":0.2,"y":0,"z":0}}。只有用户指定绝对坐标才用 position。向右为 +X。提供建议时写入 summary；无需执行则 commands=[]。有图片时依据画面中可见内容。上下文：${JSON.stringify(context)}`;
}

function clarification(question, warning) {
  return {summary:'请先确定此次修改的范围。',commands:[],questions:[question],warnings:[warning],requiresConfirmation:true};
}

function scopeLargeScene(scene, catalog, message, selection, image) {
  if(message.length>3500) return {plan:clarification('请将本次要求分成较短的几步，并指出目标房间或家具。','指令过长，无法连同必要的场景信息完整发送。')};
  const rooms=scene.buildings.flatMap(b=>b.floors.flatMap(f=>f.rooms));
  if(scene.placements.length<=(image ? 18 : 36) && scene.assets.length<=40 && rooms.length<=14) {
    const prompt=systemPrompt(scene,catalog,message,selection);
    if(prompt.length+message.length<=(image ? 8500 : 15500)) return {scene,prompt};
  }
  // A clarification can narrow an earlier whole-house request to one room.
  const [prior,reply]=message.toLowerCase().split('\n用户的新回复：');
  const latest=(reply ?? prior).split('\n图片中按像素占比')[0];
  const identifiers=text=>new Set(text.match(/[a-z0-9_-]+/g) || []);
  const latestIds=identifiers(latest);
  const identifies=(r,text)=>latestIds.has(r.id.toLowerCase()) || (r.name && text.includes(r.name.toLowerCase()));
  const newScope=reply!==undefined && (rooms.some(r=>identifies(r,latest)) || scene.assets.some(a=>identifies(a,latest)) || /选中|所选|当前房间/.test(latest));
  const intent=reply!==undefined && !newScope ? prior.split('\n助手对该要求的提问：')[0]+' '+latest : latest;
  const query=intent.replace(/(?:其他|其余)[^，。！？；\n]{0,16}(?:不变|不动|保持原样)/g,'');
  const ids=identifiers(query);
  const names=new Set();
  let remaining=query;
  for(const name of [...new Set(rooms.map(r=>r.name?.toLowerCase()).filter(Boolean))].sort((a,b)=>b.length-a.length)) {
    if(remaining.includes(name)) {names.add(name);remaining=remaining.split(name).join(' ');}
  }
  const namedRooms=rooms.filter(r=>ids.has(r.id.toLowerCase()) || names.has(r.name?.toLowerCase()));
  const selected=scene.placements.find(p=>p.id===selection.placementId);
  const current=rooms.find(r=>r.id===selection.roomId);
  const selectedOnly=Boolean(selected && (!namedRooms.length || namedRooms.some(r=>r.id===selected.containerId)) && /选中|所选|这一件|这件|selected/.test(query) && !/以及|同时调整/.test(query));
  const whole=/全屋|整屋|整套|整栋|整层|全层|整座|楼上楼下|全家|整个(?:住宅|家|别墅|房子)|所有房间|每个房间|各个?房间|每间|whole (?:home|house)|every room|all rooms/.test(query);
  const batch=/所有|全部|全都|逐[件个一]|统统|每[件个把张盏一]|一律|统一|都(?:改|换|移|调|设)|\b(?:all|every)\b/.test(query);
  const limit=image ? 7 : 14;
  const namedIds=new Set(namedRooms.map(r=>r.id));
  const roomScope=namedIds.size ? namedIds : new Set(current ? [current.id] : []);
  const roomPlacements=scene.placements.filter(p=>roomScope.has(p.containerId));
  if (whole || (batch && (!namedIds.size && !/当前房间|本房间|这间|这个房间/.test(query) || roomPlacements.length>limit))) {
    return {plan:clarification('这次要先处理哪个房间、哪件家具？可以先点选家具，再告诉我修改内容。',`完整住宅有 ${rooms.length} 个房间、${scene.placements.length} 件家具，当前上下文无法逐件核对该批量操作。`)};
  }
  const assets=new Map(scene.assets.map(a=>[a.id,a]));
  const bigrams=new Set(Array.from({length:Math.max(0,query.length-1)},(_,i)=>query.slice(i,i+2)));
  const nameMatches=new Map();
  for(const [id,a] of assets) {
    const name=(a.name || '').toLowerCase();
    const hit=Boolean(name && query.includes(name));
    let overlaps=0;
    for(const part of bigrams) if(name.includes(part)) overlaps++;
    nameMatches.set(id,{hit,score:(hit ? 100 : 0)+Math.min(overlaps,20)});
  }
  const candidates=scene.placements.map((p,index)=>{
    const match=nameMatches.get(p.assetId);
    const byId=ids.has(p.id.toLowerCase());
    const hit=byId || Boolean(match?.hit);
    const nameScore=byId ? 120 : (match?.score || 0);
    const selectedTarget=selectedOnly && p.id===selected.id;
    const score=(selectedTarget ? 10000 : 0)+(namedIds.has(p.containerId) ? 1500 : 0)+nameScore*10+
      (current?.id===p.containerId ? 5 : 0)+(p.id===selected?.id ? 3 : 0);
    return {p,index,score,hit};
  }).filter(x=>x.score>0 && (!namedIds.size || namedIds.has(x.p.containerId) || (selectedOnly && x.p.id===selected?.id)));
  candidates.sort((a,b)=>b.score-a.score || a.index-b.index);
  const placements=candidates.slice(0,limit).map(x=>x.p);
  if(!selectedOnly && candidates.slice(limit).some(x=>x.hit)) return {plan:clarification('有多件家具符合这个名称，请选择具体房间或点选需要修改的那一件。','同名目标超出本轮可以核对的范围。')};
  const usedRooms=new Set([...namedIds,...placements.map(p=>p.containerId)]);
  if(!namedIds.size && current) usedRooms.add(current.id);
  if(usedRooms.size>14 || (!usedRooms.size && !placements.length)) return {plan:clarification('请指定房间名称或先选择一件家具。','本轮无法确定需要查看的空间。')};
  const usedAssets=new Set(placements.map(p=>p.assetId));
  const includedRooms=rooms.filter(r=>usedRooms.has(r.id));
  const narrowed={...scene,buildings:[{floors:[{rooms:includedRooms}]}],placements,assets:scene.assets.filter(a=>usedAssets.has(a.id)),materials:selectCandidates(scene.materials || [],message,4)};
  const visibleCatalog={assets:selectCandidates(catalog.assets || [],message,6),materials:selectCandidates(catalog.materials || [],message,4)};
  const warning=`此次只提供 ${includedRooms.length}/${rooms.length} 个房间和 ${placements.length}/${scene.placements.length} 件家具，未列入的对象不参与修改。`;
  const shownSelection={roomId:usedRooms.has(selection.roomId) ? selection.roomId : undefined,placementId:placements.some(p=>p.id===selected?.id) ? selected.id : undefined};
  const prompt=systemPrompt(narrowed,visibleCatalog,message,shownSelection,warning);
  if(prompt.length+message.length>(image ? 8500 : 14500)) return {plan:clarification('请缩短指令或选择更小范围的房间与家具。','当前范围包含过长的房间边界、标识或说明，不能完整发送。')};
  return {scene:narrowed,prompt,warning,catalog:visibleCatalog,selectedTarget:selectedOnly ? selected.id : null};
}

export async function generateSceneCommand({ message, image, sceneDocument, selection = {}, catalog = {}, fetchImpl = fetch, env = process.env }) {
  if (!env.LLM_API_KEY || !env.LLM_BASE_URL || !env.LLM_MODEL) {
    const error = new Error('真实 LLM 服务未配置（LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）');
    error.status = 503;
    throw error;
  }
  const request = env.LLM_SOURCE === 'byok' && fetchImpl === fetch ? safeByokFetch : fetchImpl;
  const scope=scopeLargeScene(sceneDocument,catalog,message,selection,image);
  if(scope.plan) return scope.plan;
  const response = await request(`${env.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages: [{ role: 'system', content: scope.prompt }, { role: 'user', content: image ? [{ type: 'text', text: message }, { type: 'image_url', image_url: { url: image } }] : message }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1200,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(env.LLM_SOURCE !== 'byok' && /^http:\/\/(127\.0\.0\.1|localhost):/.test(env.LLM_BASE_URL) ? 300_000 : 45_000),
  });
  const body = await response.json();
  if (!response.ok) {
    const detail=[body.error?.code,body.error?.type,body.error?.message].join(' ');
    if([400,413,422].includes(response.status) && /context[_ ]length|exceed(?:s|ed)?[_ ](?:the )?(?:available )?context|context[_ ]size|too many tokens/i.test(detail)) {
      return clarification('请选定一件家具或一个房间；若附有图片，请裁出要参考的区域后重试。','场景与附件超过本次模型的上下文容量，此次没有生成修改。');
    }
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
  if(scope.warning) {
    const targets=new Set([...scope.scene.placements.map(p=>p.id),...scope.scene.buildings[0].floors[0].rooms.map(r=>r.id)]);
    for(const cmd of plan.commands) {
      const target=cmd.placementId || cmd.targetId || cmd.containerId;
      if(!targets.has(target) || (scope.selectedTarget && cmd.type!=='place_asset' && target!==scope.selectedTarget)) {
        return clarification('方案包含当前范围之外的对象。请指定目标房间或点选要修改的家具。',scope.warning);
      }
    }
    plan.warnings=[...(plan.warnings || []),scope.warning];
  }
  const executor = new SceneCommandExecutor({ getSceneDocument: () => scope.scene });
  executor.catalog = scope.catalog || catalog;
  const preview = executor.preview(plan);
  if(scope.warning && preview.errors.length) return clarification('方案引用了本轮清单以外的对象，请明确家具或材料名称。',scope.warning);
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
