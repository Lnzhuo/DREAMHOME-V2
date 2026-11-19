import { createLux3dClient } from '@manycore/aholo-sdk-lux3d';
import { loadServerEnv } from '../../server/env.mjs';
await loadServerEnv();
const taskId=process.env.TASK_ID;
if (!taskId || !process.env.AHOLO_API_KEY) { console.error('需要 TASK_ID 和服务端 Aholo 配置'); process.exit(2); }
const client=createLux3dClient({region:process.env.AHOLO_REGION||'cn',apiKey:process.env.AHOLO_API_KEY});
const detail=await client.tasks.retrieve(taskId); let matched;
for(let page=1;page<=4;page++) { const data=await client.tasks.list({page,pageSize:100}); matched=(data.items||[]).find(item=>String(item.taskId)===taskId); if(matched || (data.items||[]).length<100) break; }
console.log(JSON.stringify({taskId,status:detail.status,taskListConsumedCredits:typeof matched?.consumedCredits==='number'?matched.consumedCredits:null,creditEvidence:'任务列表字段；账户最终扣费及退款以账单为准'},null,2));
