import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Lux3DProvider } from '../src/providers/lux3d/node-provider.js';

const glbBytes = () => Buffer.concat([Buffer.from('glTF'), Buffer.from([2,0,0,0,12,0,0,0,0,0,0,0])]);
const asset = () => ({id:'asset-mock-only',name:'Mock archive test',category:'furniture',source:'lux3d_text',providerTaskId:'mock-task',dimensions:{width:{value:1,unit:'m',source:'estimated'},depth:{value:1,unit:'m',source:'estimated'},height:{value:1,unit:'m',source:'estimated'}},licenseStatus:'user_owned',createdAt:new Date().toISOString()});

test('Lux3D Provider blocks real generation without key or paid approval', () => {
  assert.throws(()=>new Lux3DProvider({env:{}}).assertConfigured(),error=>error.status===503);
  assert.throws(()=>new Lux3DProvider({env:{AHOLO_API_KEY:'mock-only'}}).assertConfigured(),error=>error.status===503);
});

test('Lux3D archive mock writes GLB bytes, hash and permanent metadata', async (context) => {
  const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'dreamhome-lux3d-'));
  context.after(()=>fs.rm(dataRoot,{recursive:true,force:true}));
  const provider=new Lux3DProvider({dataRoot,env:{}});
  const result=await provider.archiveGlb({bytes:glbBytes(),asset:asset(),projectId:'mock'});
  const modelPath=path.join(dataRoot,'projects','mock','assets',result.id,'model.glb');
  assert.equal((await fs.readFile(modelPath)).toString('ascii',0,4),'glTF');
  assert.equal(result.archive.bytes,glbBytes().length);
  assert.match(result.archive.sha256,/^[a-f0-9]{64}$/);
  assert.equal(result.modelUrl,`/api/assets/${result.id}/model.glb`);
  const metadata=JSON.parse(await fs.readFile(path.join(dataRoot,'projects','mock','assets',result.id,'asset.json'),'utf8'));
  assert.equal(metadata.providerTaskId,'mock-task');
});

test('Lux3D archive rejects ZIP or invalid content', async (context) => {
  const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'dreamhome-lux3d-'));
  context.after(()=>fs.rm(dataRoot,{recursive:true,force:true}));
  const provider=new Lux3DProvider({dataRoot,env:{}});
  await assert.rejects(()=>provider.archiveGlb({bytes:Buffer.from('PK-not-a-glb'),asset:asset(),projectId:'mock'}),/有效 GLB/);
});

test('Lux3D download mock archives immediately and never stores the temporary URL', async (context) => {
  const dataRoot=await fs.mkdtemp(path.join(os.tmpdir(),'dreamhome-lux3d-'));
  context.after(()=>fs.rm(dataRoot,{recursive:true,force:true}));
  const bytes=glbBytes();
  const fetchImpl=async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  const provider=new Lux3DProvider({dataRoot,env:{},fetchImpl});
  const result=await provider.downloadAndArchive({outputs:[{content:'https://provider.invalid/temporary/model.glb?expires=1',type:'glb'}],asset:asset(),projectId:'mock'});
  assert.equal(result.modelUrl,`/api/assets/${result.id}/model.glb`);
  assert.equal(result.modelUrl.includes('provider.invalid'),false);
});
