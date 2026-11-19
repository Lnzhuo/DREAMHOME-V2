import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {referenceDimensions} from './reference-dimensions.mjs';

const ids=new Set(process.argv.slice(2));
assert(ids.size,'请指定已经确认正面和竖直轴的馆藏模型任务 ID');
const lib='data/library';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const index=await read(lib+'/index.json'),progress=await read(lib+'/new-lux3d-progress.json');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
async function publish(file,bytes) {
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  await fs.writeFile(temp,bytes,{flag:'wx'});await fs.rename(temp,file);
}
const save=(file,data)=>publish(file,JSON.stringify(data,null,2));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const a of index.assets.filter(a=>ids.has(a.providerTaskId))){
  const target=a.referenceSource?.referenceMeters;assert(target);
  const dir=path.join(lib,'models',a.id);
  const source=await fs.readFile(path.join('data/projects/v2-generated/assets',a.id,'model.glb'));
  assert(sha(source)===(a.archive.originalSha256||a.archive.sha256));
  const doc=await io.readBinary(new Uint8Array(source)),root=doc.getRoot();
  const scene=root.getDefaultScene()||root.listScenes()[0],bounds=getBounds(scene);
  const size=bounds.max.map((v,i)=>v-bounds.min[i]),nominal=size[1]/target.height;
  const factors=[nominal*target.width/size[0],1,nominal*target.depth/size[2]];
  assert(factors.every(v=>v>.60 && v<1.60),'需要核查造型或方向，停止轴向修整');
  const children=scene.listChildren();
  const pivot=doc.createNode('museum-dimensions').setScale(factors);
  for(const node of children) {scene.removeChild(node);pivot.addChild(node);}
  scene.addChild(pivot);
  const raw=await io.writeBinary(doc),corrected=await io.readBinary(raw);
  const freshBounds=getBounds(corrected.getRoot().getDefaultScene()||corrected.getRoot().listScenes()[0]);
  const ref=referenceDimensions(a.name,a.category,freshBounds,a.referenceSource);
  assert(ref.exceptions.length===0);
  await publish(path.join(dir,'model.glb'),raw);
  a.archive={...a.archive,originalSha256:sha(source),sha256:sha(raw),bytes:raw.byteLength};
  a.boundingBox=freshBounds;a.dimensions=ref.dimensions;a.designReference=ref.reference;
  a.scaleCalibrationRequired=false;
  a.importCorrection={method:'按馆藏宽深高校正网格比例',source:a.referenceSource.sourceUrl,scaleFactors:factors,rawSha256:sha(source),correctedSha256:sha(raw)};
  a.qa.visualReview='待人工检查校准后的模型';a.qa.placementTest='待校准后场景复验';
  for(const key of ['thumbnail','thumbnailUrl','planThumbnail','planThumbnailUrl'])delete a[key];
  delete progress[a.id];
  await save(path.join(dir,'asset.json'),a);
  console.log(a.name,factors);
}
await save(lib+'/index.json',index);await save(lib+'/new-lux3d-progress.json',progress);

