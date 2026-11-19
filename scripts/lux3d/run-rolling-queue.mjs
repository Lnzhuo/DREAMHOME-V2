import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Lux3DProvider } from '../../src/providers/lux3d/node-provider.js';
import { loadServerEnv } from '../../server/env.mjs';
await loadServerEnv();
const root = path.resolve('data', 'lux3d-v2');
const lock = path.join(root, 'batch.lock'), ledgerPath = path.join(root, 'reservations.json');
await fs.mkdir(root,{recursive:true});
const handle = await fs.open(lock,'wx').catch(()=>{throw new Error('已有生成流程或遗留锁，禁止并发调度');});
let entries, candidates;
try {
  entries = JSON.parse(await fs.readFile(ledgerPath,'utf8'));
  const imageCandidates = JSON.parse(await fs.readFile(path.join(root,'priority-image-candidates.json'),'utf8').catch(()=>'[]'));
  candidates = [...imageCandidates, ...JSON.parse(await fs.readFile(path.join(root,'rolling-candidates.json'),'utf8'))];
} catch(error) { await handle.close(); await fs.unlink(lock); throw error; }
let writes = Promise.resolve();
async function persist() {
  writes = writes.then(async () => { const temp = ledgerPath+'.tmp'; await fs.writeFile(temp,JSON.stringify(entries,null,2)); for(let attempt=0;;attempt++) { try { await fs.rename(temp,ledgerPath); break; } catch(error) { if(!['EPERM','EACCES','EBUSY'].includes(error.code) || attempt>=40) throw error; await new Promise(resolve=>setTimeout(resolve,250)); } } });
  return writes;
}
const provider = new Lux3DProvider({env:{...process.env,LUX3D_ALLOW_PAID_GENERATION:'true'}});
let halted = false;
const active = new Set();
const budget = 3540;
const maximumParallel = 5;
const uncertainHoldMs = 20 * 60 * 1000;
async function waitForResult(taskId) {
  const started=Date.now(); let errors=0;
  while(Date.now()-started < 20*60*1000) {
    try {
      const result=await provider.getJob(taskId); errors=0;
      if(result.status===3) return result;
      if(result.status===4 || result.status===6) { const error=new Error('任务失败'); error.providerStatus=result.status; throw error; }
      await new Promise(resolve=>setTimeout(resolve,12000));
    } catch(error) {
      if(error.providerStatus) throw error;
      if(++errors>8) throw new Error('状态查询持续失败，需人工核查');
      await new Promise(resolve=>setTimeout(resolve,Math.min(60000, 5000*2**Math.min(errors,4))));
    }
  }
  throw new Error('等待超时，需人工核查');
}
async function execute(item, entry) {
  try {
    if (!entry.taskId) {
      // Durable reservation precedes submission. A crash here is never retried automatically.
      const id = item.mode === 'image' ? await provider.createImageJob({filePath:path.resolve(item.filePath),version:'G1',faceCount:60000}) : await provider.createTextJob({prompt:item.prompt,version:'G1',faceCount:60000});
      entry.taskId=String(id); entry.status='submitted'; await persist();
      console.log(`提交 ${item.name} taskId=${entry.taskId}`);
    }
    const result = await waitForResult(entry.taskId);
    const unknown=()=>({value:null,unit:'m',source:'unknown'});
    const asset={id:`asset-${crypto.randomUUID()}`,name:item.name,category:item.category,source:item.mode === 'image' ? 'lux3d_image' : 'lux3d_text',providerTaskId:entry.taskId,prompt:item.prompt,referenceSource:item.source,licenseStatus:'provider_terms_check',dimensions:{width:unknown(),depth:unknown(),height:unknown()},createdAt:new Date().toISOString()};
    entry.asset=await provider.downloadAndArchive({outputs:result.outputs,asset,projectId:'v2-generated'});
    if (item.mode === 'image') {
      const assetDir=path.join(provider.dataRoot,'projects','v2-generated','assets',asset.id);
      await fs.copyFile(path.resolve(item.filePath), path.join(assetDir,'reference-input.jpg'));
      if(item.source?.originalPath) await fs.copyFile(path.resolve(item.source.originalPath), path.join(assetDir,'reference-original.jpg'));
    }
    entry.status='archived'; await persist(); console.log(`归档 ${item.name} taskId=${entry.taskId}`);

  } catch(error) {
    let status;
    if(entry.taskId) try { status=(await provider.getJob(entry.taskId)).status; } catch {}
    if(status===4 || status===6) { entry.status='failed_confirmed'; entry.providerStatus=status; entry.error='服务商终态失败或取消，不重试'; }
    else { entry.status='uncertain_or_failed'; entry.uncertainAt=new Date().toISOString(); entry.error='结果或提交不明，不重试并保留冻结'; }
    await persist(); console.error(`${item.name}: ${entry.status}，保留20积分冻结`);
  }
}
try {
  for (const entry of entries) { if ((!entry.taskId && entry.status==='reserved') || entry.status==='uncertain_or_failed') { entry.status='uncertain_or_failed'; entry.uncertainAt ||= new Date().toISOString(); } }
  await persist();
  const start=(item,entry)=>{const promise=execute(item,entry).catch(() => { halted=true; console.error('账本或任务处理异常，已停止新提交'); }); active.add(promise); promise.then(()=>active.delete(promise));};
  for (const entry of entries.filter(e=>e.status==='submitted'&&e.taskId)) {
    const item=candidates.find(c=>c.name===entry.name); if(!item) {halted=true; break;} start(item,entry);
  }
  const existing=new Set(entries.map(e=>e.name));
  const pending=candidates.filter(c=>!existing.has(c.name));
  while(!halted && (pending.length || active.size)) {
    const now = Date.now();
    for (const entry of entries) if (entry.status==='uncertain_or_failed' && now-Date.parse(entry.uncertainAt)>=uncertainHoldMs) entry.status='submission_uncertain_held';
    const uncertainSlots = entries.filter(e=>e.status==='uncertain_or_failed').length;
    while(!halted && pending.length && active.size + uncertainSlots < maximumParallel) {
      const spent=entries.reduce((sum,e)=>sum+(Number(e.frozenCredits)||0),0);
      if(spent+20>budget) { pending.length=0; break; }
      const item=pending.shift();
      const entry={name:item.name,expectedCredits:20,actualCredits:null,frozenCredits:20,status:'reserved',createdAt:new Date().toISOString()};
      entries.push(entry); await persist(); start(item,entry);
    }
    if(active.size || (pending.length && uncertainSlots)) await Promise.race([...active, new Promise(resolve=>setTimeout(resolve,30000))]); else break;
  }
  await Promise.allSettled([...active]); await persist();
  console.log(halted ? '已停止新提交，存在结果不明任务' : '队列完成或达到授权上限');
} finally { await Promise.allSettled([...active]); await handle.close(); await fs.unlink(lock); }
