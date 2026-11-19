import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const script=fileURLToPath(new URL('./interior.py',import.meta.url));
let busy=false;
async function rendererPath() {
  if(process.env.BLENDER_BIN) return process.env.BLENDER_BIN;
  if(process.platform!=='win32') return 'blender';
  const root=path.join(process.env.ProgramFiles || 'C:/Program Files','Blender Foundation');
  const entries=await fs.readdir(root).catch(()=>[]);
  for(const dir of entries.sort().reverse()) {
    const exe=path.join(root,dir,'blender.exe');
    if(await fs.access(exe).then(()=>true,()=>false)) return exe;
  }
  return 'blender';
}

export async function handleInteriorRender(req,res) {
  const error=(status,message)=>{if(!res.destroyed && !res.headersSent) res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify({error:message}));};
  const host=req.headers.host || '';
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
    || req.headers.origin!=='http://'+host) return error(403,'精渲仅在本机工作室提供');
  if(req.method!=='POST' || req.headers['content-type']!=='model/gltf-binary') return error(415,'需要当前场景的 GLB 文件');
  if(busy) return error(429,'另一个视角正在渲染，请稍后重试');
  let dir,child;
  busy=true;
  const cancel=()=>child?.kill();
  res.on('close',cancel);
  try {
    const chunks=[];let size=0;
    for await(const chunk of req) {
      size+=chunk.length;
      if(size>160*1024*1024) return error(413,'当前场景过大，请减少同屏模型后再试');
      chunks.push(chunk);
    }
    const bytes=Buffer.concat(chunks);
    if(bytes.length<24 || bytes.toString('ascii',0,4)!=='glTF' || bytes.readUInt32LE(4)!==2
      || bytes.readUInt32LE(8)!==bytes.length || bytes.readUInt32LE(12)>bytes.length-20) return error(400,'场景文件不完整');
    const meta=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    if(!meta.cameras?.length || [...(meta.buffers||[]),...(meta.images||[])].some(v=>v.uri)) return error(400,'精渲需要带相机和内嵌资源的场景');
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'dreamhome-still-'));
    const input=path.join(dir,'view.glb'), output=path.join(dir,'still.jpg');
    await fs.writeFile(input,bytes);
    const exe=await rendererPath();
    if(res.destroyed) return;
    await new Promise((resolve,reject)=>{
      child=spawn(exe,['--background','--factory-startup','--disable-autoexec','--threads','6','--python-exit-code','2','--python',script,'--',input,output],{stdio:'ignore',windowsHide:true});
      const timer=setTimeout(()=>child.kill(),300000);
      child.on('error',e=>{clearTimeout(timer);reject(e);});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('render'));});
    });
    const jpg=await fs.readFile(output);
    if(!res.destroyed) res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'}).end(jpg);
  } catch(e) {
    error(e.code==='ENOENT'?503:500,e.code==='ENOENT'?'本机未找到 Blender，请安装或设置 BLENDER_BIN':'当前视角渲染失败，请重试');
  } finally {
    busy=false;
    res.off('close',cancel);
    if(dir) await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
