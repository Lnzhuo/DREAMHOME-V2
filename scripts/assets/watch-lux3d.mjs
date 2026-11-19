import fs from 'node:fs/promises';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const once=process.argv.includes('--once'),root='data/library',progressPath=`${root}/new-lux3d-progress.json`;let lastSnapshotTime=0;
async function run(cmd,args=[],env={}) {return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let out='';for(const stream of [child.stdout,child.stderr])stream.on('data',x=>out+=x);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(Error(`${cmd} exited ${code}: ${out.slice(-1000)}`)));});}
async function cycle(){
 const progress=JSON.parse(await fs.readFile(progressPath).catch(()=>Buffer.from('{}'))),reservations=JSON.parse(await fs.readFile('data/lux3d-v2/reservations.json').catch(()=>Buffer.from('[]'))),index=JSON.parse(await fs.readFile(`${root}/index.json`));
 const archived=reservations.filter(r=>r.status==='archived'&&r.asset?.id);const need=archived.filter(r=>!progress[r.asset.id]&&!index.assets.find(a=>a.id===r.asset.id)?.qa?.placementTest?.startsWith('通过'));
 if(!need.length)return;
 const ids=need.map(r=>r.asset.id);console.log(`发现待验证 Lux3D ${ids.length} 件: ${ids.join(', ')}`);
 await run(process.execPath,['scripts/assets/import-lux3d.mjs']);await run(process.execPath,['scripts/assets/render-thumbnails.mjs']);await run(process.execPath,['scripts/assets/render-plans.mjs']);
 await fs.mkdir(`${root}/lux-qa`,{recursive:true});const report=`${root}/lux-qa/batch-${Date.now()}.json`;
 const afterImport=JSON.parse(await fs.readFile(`${root}/index.json`));
 const testable=ids.filter(id=>{const a=afterImport.assets.find(x=>x.id===id);return a && !a.scaleCalibrationRequired && ['width','depth','height'].every(key=>Number.isFinite(a.dimensions?.[key]?.value));});
 if(testable.length) await run(process.execPath,['scripts/assets/verify-new-lux3d.mjs'],{DREAMHOME_QA_ASSETS:JSON.stringify(testable),DREAMHOME_QA_REPORT:report});
 const data=testable.length?JSON.parse(await fs.readFile(report)):{results:[]},after=JSON.parse(await fs.readFile(`${root}/index.json`));
 for(const id of ids){const result=data.results.find(r=>r.id===id),asset=after.assets.find(a=>a.id===id);if(!asset)continue;asset.qa??={};const calibration=!testable.includes(id);asset.qa.placementTest=calibration?'待尺寸异常单独校准':result?.status==='passed'?`通过：真实载入、拾取、变换、保存重开（${report}）`:`失败或未完成：${result?.error||'无结果'}`;asset.qa.visualReview='待人工检查真实缩略图';progress[id]={taskId:asset.providerTaskId,placement:calibration?'calibration_required':result?.status||'missing',visual:'pending',report:calibration?null:report,at:new Date().toISOString()};await fs.writeFile(`${root}/models/${id}/asset.json`,JSON.stringify(asset,null,2)+'\n');console.log(`${asset.name}：场景 ${result?.status||'missing'}，缩略图待目检`);}
 const indexPath=`${root}/index.json`,indexTemp=`${indexPath}.${crypto.randomUUID()}.tmp`,progressTemp=`${progressPath}.${crypto.randomUUID()}.tmp`;await fs.writeFile(indexTemp,JSON.stringify(after,null,2)+'\n');await fs.rename(indexTemp,indexPath);await fs.writeFile(progressTemp,JSON.stringify(progress,null,2)+'\n');await fs.rename(progressTemp,progressPath);await run('python',['scripts/assets/write-ledger.py']);if(Date.now()-lastSnapshotTime>=300000){const result=await run(process.execPath,['scripts/assets/freeze-catalog.mjs']);console.log('目录快照',result.trim());lastSnapshotTime=Date.now();}
}
do {try{await cycle()}catch(e){console.error('增量处理失败，稍后重试：',e.message)}if(!once)await new Promise(r=>setTimeout(r,15000));}while(!once);
