import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {requiresReview} from '../../src/assets/catalog-filters.js';

const [basePath, decisionsPath, output] = process.argv.slice(2);
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const [base,current,decisions,readiness]=await Promise.all([
  read(basePath),read('data/library/index.json'),read(decisionsPath),
  read('docs/verification/v2/lux3d-reviewed.json'),
]);
const currentById=new Map(current.assets.map(a=>[a.id,a]));
const approvedIds=new Set(readiness.items.filter(r=>r.strictReady).map(r=>r.id));
const qualifies=a=>{
  const d=decisions[a.id];
  return d?.accept===true && approvedIds.has(a.id) && !requiresReview(a)
    && d.taskId===a.providerTaskId && d.modelSHA256===a.archive.sha256
    && d.thumbnailSHA256===a.thumbnail?.sha256 && d.planSHA256===a.planThumbnail?.sha256;
};
const assets=base.assets.map(old=>{
  const a=currentById.get(old.id);
  assert(a && old.archive.sha256===a.archive.sha256,'线上已有模型文件改变 '+old.name);
  return qualifies(a)?a:old;
});
const priorIds=new Set(assets.map(a=>a.id));
const additions=current.assets.filter(a=>!priorIds.has(a.id) && qualifies(a));
assets.push(...additions);
assert.equal(assets.length,new Set(assets.map(a=>a.archive.sha256)).size);
await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'catalog.json'),JSON.stringify({...base,assets},null,2));
await fs.writeFile(path.join(output,'additions.json'),JSON.stringify({assets:additions},null,2));
console.log(JSON.stringify({previous:base.assets.length,added:additions.length,public:assets.length}));

