import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const file=process.argv[2];
if(!file) throw Error('需要逐件目检决议文件');
const decisions=JSON.parse(await fs.readFile(file,'utf8'));
const root='data/library';
const indexPath=path.join(root,'index.json'),progressPath=path.join(root,'new-lux3d-progress.json');
const index=JSON.parse(await fs.readFile(indexPath,'utf8')),progress=JSON.parse(await fs.readFile(progressPath,'utf8'));
async function write(target,value) {
  const tmp=target+'.'+crypto.randomUUID()+'.tmp';
  await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'}); await fs.rename(tmp,target);
}
for(const a of index.assets) {
  const d=decisions[a.id]; if(!d) continue;
  if(d.taskId!==a.providerTaskId || d.modelSHA256!==a.archive.sha256 || d.thumbnailSHA256!==a.thumbnail?.sha256 || d.planSHA256!==a.planThumbnail?.sha256) throw Error('目检与当前资源不匹配 '+a.name);
  if(d.displayName && a.name!==d.displayName) {
    if(index.assets.some(other=>other.id!==a.id && other.name===d.displayName)) throw Error('目录名称已存在 '+d.displayName);
    a.requestedName??=a.name;
    a.tags=(a.tags||[]).map(t=>t===a.name?d.displayName:t);
    a.name=d.displayName;
  }
  a.qa.visualReview=(d.accept?'已人工目检，':'需复核，')+d.note;
  const record=progress[a.id];
  if(record) record.visual=d.accept?'passed_manual':'needs_review';
  await write(path.join(root,'models',a.id,'asset.json'),a);
}
await write(indexPath,index);await write(progressPath,progress);

