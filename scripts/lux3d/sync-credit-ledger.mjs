import fs from 'node:fs/promises';
import {createLux3dClient} from '@manycore/aholo-sdk-lux3d';
import {loadServerEnv} from '../../server/env.mjs';
import {policy,readBalance} from '../../server/lux3d/credit-policy.mjs';

await loadServerEnv();
const client=createLux3dClient({region:'cn',apiKey:process.env.AHOLO_API_KEY});
const root='data/lux3d-v2';
const target='docs/LUX3D_CREDIT_LEDGER.csv';
const once=process.argv.includes('--once');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const escape=value=>'"'+String(value??'').replaceAll('"','""')+'"';

async function sync() {
  const costs=new Map();
  for(let page=1;;page++){
    const {items}=await client.tasks.list({page,pageSize:100});
    if(!Array.isArray(items)) throw Error('任务列表不可核实');
    for(const task of items) costs.set(String(task.taskId),task);
    if(items.length<100) break;
  }
  const account=await readBalance();
  const entries=JSON.parse(await fs.readFile(root+'/reservations.json','utf8'));
  const rows=[['日期','来源','资产','taskId','状态','预计积分','实际积分','余额','依据','冻结积分']];
  const currentDate=account.snapshotAt.slice(0,10);
  for(const [name,id] of [['沙发','8394445'],['茶几','8395285'],['落地灯','8396095']]) {
    rows.push(['2026-11-19','平台',name,id,'已生成',20,costs.get(id)?.consumedCredits??20,'','早期已确认任务']);
  }
  rows.push(['2026-11-19','平台','账户余额','','17:08 历史记录','','',3400,'历史用量页']);
  rows.push(['2026-11-19','平台','本轮授权起点','','19:15 已核实','','',policy.openingBalance,'中国区实时余额，最低保留 '+policy.minimumBalance]);
  rows.push([currentDate,'平台','账户余额快照','',account.snapshotAt,'','',account.availableCredits,'中国区账户实时接口']);
  for(const e of entries){
    const t=costs.get(String(e.taskId));
    rows.push([e.createdAt?.slice(0,10),'平台',e.name,e.taskId,e.status,e.expectedCredits,t?.consumedCredits??'待对账','','平台任务费用，失败退款以余额流水为准',e.frozenCredits??'']);
  }
  const temp=target+'.'+process.pid+'.tmp';
  await fs.writeFile(temp,'\ufeff'+rows.map(row=>rows[0].map((_,i)=>escape(row[i])).join(',')).join('\n')+'\n');
  for(let i=0;;i++){
    try {await fs.rename(temp,target);break;} catch(error){if(i>=20||!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;await pause(250);}
  }
  const snapshot={...account,minimumBalance:policy.minimumBalance,tasks:[...costs.values()].map(t=>({taskId:String(t.taskId),status:t.status,consumedCredits:t.consumedCredits,created:t.created}))};
  await fs.writeFile(root+'/account-snapshot.json',JSON.stringify(snapshot,null,2));
  console.log(account.snapshotAt,account.availableCredits,entries.length);
}
do {
  await sync();
  if(once)break;
  await pause(15000);
} while(await fs.access(root+'/batch.lock').then(()=>true,()=>false));
if(!once) await sync();
