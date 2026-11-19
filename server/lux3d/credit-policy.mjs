// All platform submissions hold batch.lock and reserve here before calling Lux3D.
export const policy = Object.freeze({
  start: '2026-11-19T11:15:03.566Z',
  openingBalance: 1720,
  minimumBalance: 300,
  standardCredits: 20,
});

const pending = new Set(['reserved', 'submitted', 'submission_uncertain_held', 'uncertain_or_failed']);
function exposure(entry) {
  if (['archived','failed_confirmed'].includes(entry.status) && Number.isSafeInteger(entry.actualCredits) && entry.actualCredits >= 0) return entry.actualCredits;
  return Math.max(Number(entry.frozenCredits) || 0, Number(entry.expectedCredits) || 0, Number(entry.actualCredits) || 0);
}

export function reconcileTaskCosts(entries, tasks) {
  const costs = new Map(tasks.map(t=>[String(t.taskId),t]));
  let changed=false;
  for(const entry of entries) {
    if(!entry.taskId || !['archived','failed_confirmed'].includes(entry.status)) continue;
    const t=costs.get(String(entry.taskId));
    if(!t || ![3,4,6].includes(t.status) || !Number.isSafeInteger(t.consumedCredits) || t.consumedCredits<0) continue;
    if(entry.actualCredits===t.consumedCredits && entry.frozenCredits===0) continue;
    entry.actualCredits=t.consumedCredits;
    entry.frozenCredits=0;
    changed=true;
  }
  return changed;
}

export async function readBalance(env = process.env) {
  if ((env.AHOLO_REGION || 'cn') !== 'cn' || !env.AHOLO_API_KEY) throw Error('中国区平台账户不可用');
  const response = await fetch('https://api.aholo3d.cn/lux3d/v1/account/balance?source=1', {
    headers: {Authorization: env.AHOLO_API_KEY}, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('中国区账户余额查询失败');
  const {c, d} = await response.json();
  if (String(c) !== '0' || !Number.isSafeInteger(d?.availableCredits) || d.availableCredits < 0) throw Error('账户余额无法确认');
  return {availableCredits:d.availableCredits, snapshotAt:d.snapshotAt};
}

export function mayRetrySettledFailure(entries,name,taskId) {
  const prior=entries.filter(e=>e.name===name);
  return !!taskId && prior.length===1 && prior[0].taskId===taskId && prior[0].status==='failed_confirmed' && prior[0].actualCredits===0;
}

export async function reserveCredits(entries, name, {balance = readBalance, cost = policy.standardCredits, retryOf} = {}) {
  if (entries.some(e => e.name === name) && !mayRetrySettledFailure(entries,name,retryOf)) throw Object.assign(Error('已有同名任务或冻结记录'), {status:409});
  if (!Number.isSafeInteger(cost) || cost <= 0 || cost > policy.standardCredits) throw Error('报价超出单件授权');
  const held = entries.filter(e => pending.has(e.status)).reduce((sum,e)=>sum+exposure(e),0);
  const priorUnknown = entries.filter(e => e.createdAt < policy.start && !e.taskId && pending.has(e.status)).reduce((sum,e)=>sum+exposure(e),0);
  const used = entries.filter(e => e.createdAt >= policy.start).reduce((sum,e)=>sum+exposure(e),0);
  const cap = policy.openingBalance - policy.minimumBalance;
  const denied = () => Object.assign(Error('平台授权额度已达上限，保留账户积分'), {status:429});
  if (priorUnknown + used + cost > cap || held + cost > cap) throw denied();
  const account = await balance();
  if (account.availableCredits - held - cost < policy.minimumBalance) throw denied();
  const entry = {name,expectedCredits:cost,actualCredits:null,frozenCredits:cost,status:'reserved',createdAt:new Date().toISOString(),balanceBefore:account.availableCredits};
  entries.push(entry);
  return entry;
}
