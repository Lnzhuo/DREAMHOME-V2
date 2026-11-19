import fs from 'node:fs/promises';
import { createLux3dClient } from '@manycore/aholo-sdk-lux3d';
import { loadServerEnv } from '../../server/env.mjs';
await loadServerEnv();
const client=createLux3dClient({region:process.env.AHOLO_REGION||'cn',apiKey:process.env.AHOLO_API_KEY});
const ledger='data/lux3d-v2/reservations.json', target='docs/LUX3D_CREDIT_LEDGER.csv';
const q=v=>`"${String(v??'').replaceAll('"','""')}"`;
let previous='', lastRead=0, costs=new Map();
async function sync() {
  const raw=await fs.readFile(ledger,'utf8');
  if(Date.now()-lastRead > 60000) {
    try {
      const updated=new Map();
      for(let page=1;page<=4;page++) { const data=await client.tasks.list({page,pageSize:100}); for(const item of data.items||[]) if(typeof item.consumedCredits==='number') updated.set(String(item.taskId),item.consumedCredits); if((data.items||[]).length<100) break; }
      costs=updated; lastRead=Date.now(); previous='';
    } catch { lastRead=Date.now(); }
  }
  if(raw===previous) return; previous=raw;
  const entries=JSON.parse(raw);
  const rows=[['日期','来源','资产','taskId','状态','预计积分','实际积分','余额','依据'],['2026-11-19','平台','沙发','8394445','已生成','20','20','','负责人确认账单'],['2026-11-19','平台','茶几','8395285','已生成','20','20','','负责人确认账单'],['2026-11-19','平台','落地灯','8396095','已生成','20','20','','负责人确认账单'],['2026-11-19','平台','账户余额','','17:08已核实','','','3400','非实时余额；此后新任务会继续扣费'],['2026-11-19','平台','新增前两批汇总','','用量页已核对','','','','17:08用量页当时显示7笔合计140；无taskId；失败任务退款待核；汇总不重复计入实际积分列']];
  for(const e of entries) { const has=costs.has(String(e.taskId)); rows.push([e.createdAt?.slice(0,10),'平台',e.name,e.taskId,e.status,e.expectedCredits,has?costs.get(String(e.taskId)):'待对账','',has?'任务列表 consumedCredits；最终退款以账单为准；冻结保留':'冻结保留；无任务费用字段']); }
  const temp=target+'.tmp'; await fs.writeFile(temp,'\ufeff'+rows.map(row=>row.map(q).join(',')).join('\n')+'\n'); for(let attempt=0;;attempt++) { try { await fs.rename(temp,target); break; } catch(error) { if(!['EPERM','EACCES','EBUSY'].includes(error.code) || attempt>=40) throw error; await new Promise(resolve=>setTimeout(resolve,250)); } }
}
while(true){ await sync(); await new Promise(resolve=>setTimeout(resolve,10000)); try { await fs.access('data/lux3d-v2/batch.lock'); } catch { await sync(); break; } }
