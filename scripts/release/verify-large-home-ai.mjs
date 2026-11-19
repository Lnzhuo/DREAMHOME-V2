import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { handleAiRequest } from '../../server/ai/handler.js';
import sharp from 'sharp';

const root=fileURLToPath(new URL('../../',import.meta.url));
process.chdir(root);
const out=process.env.DEMO_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(),'dreamhome-large-ai-'));
await fs.mkdir(out,{recursive:true});
const catalog=JSON.parse(await fs.readFile('data/library/index.json','utf8'));
const want=id=>{
  const found=catalog.assets.find(a=>String(a.providerTaskId)===id);
  assert(found,'原始目录模型不存在 '+id);
  return {id:found.id,name:found.name,category:found.category,dimensions:found.dimensions};
};
const sofa=want('8394445'),table=want('8395285'),lamp=want('8396095');
const rooms=['客厅','书房','主卧','餐厅'].map((name,i)=>({id:'room-'+i,name,
  boundary:[[i*20,0],[i*20+18,0],[i*20+18,18],[i*20,18]].map(([x,y])=>({x,y}))}));
const placements=Array.from({length:120},(_,i)=>{
  const room=i>=118 ? (i===118 ? 1 : 0) : [0,2,3][i%3];
  const index=Math.floor(i/3);
  return {id:'home-placement-'+String(i).padStart(3,'0'),assetId:i===119 ? sofa.id : i===118 ? table.id : lamp.id,
    containerId:rooms[room].id,position:{x:room*20+1+(index%6)*2.6,y:0,z:1+Math.floor(index/6)*2.3},rotation:{x:0,y:0,z:0}};
});
const sceneDocument={buildings:[{floors:[{rooms}]}],placements,assets:[sofa,table,lamp],materials:[]};
const selection={placementId:placements[119].id,roomId:rooms[0].id};
const evidence={date:new Date().toISOString(),model:'dreamhome-qwen3-vl',fixture:'四个房间共120个家具实例，分用三个实存 GLB，最后两项为跨房间目标与已选目标。',cases:[],inference:[]};
const originalFetch=globalThis.fetch;
function listen(server) {return new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',()=>resolve(server.address().port)));}
const reserve=http.createServer();
const inferencePort=await listen(reserve);
await new Promise(resolve=>reserve.close(resolve));
const modelRoot=path.join(root,'data/local-ai');
const secret=randomBytes(32).toString('hex');
const model=spawn(path.join(modelRoot,'runtime/llama-server.exe'),[
  '-m',path.join(modelRoot,'Qwen3VL-4B-Instruct-Q4_K_M.gguf'),'--mmproj',path.join(modelRoot,'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf'),
  '--alias',evidence.model,'--host','127.0.0.1','--port',String(inferencePort),'-c','8192','-ngl',process.env.DEMO_GPU_LAYERS || '0','--no-mmproj-offload','-t','6','--parallel','1','--jinja'],
  {windowsHide:true,cwd:out,env:{...process.env,LLAMA_API_KEY:secret},stdio:'ignore'});
const exited=new Promise(resolve=>{model.once('exit',resolve);model.once('error',resolve);});
const upstream='http://127.0.0.1:'+inferencePort;
const app=http.createServer((req,res)=>{if(req.url==='/api/ai/scene-command') handleAiRequest(req,res);else res.writeHead(404).end();});
try {
  let ready=false;
  for(let i=0;i<150;i++) {
    if(model.exitCode!==null) throw Error('专用本地模型提前退出');
    if(await originalFetch(upstream+'/health',{signal:AbortSignal.timeout(2500)}).then(r=>r.ok).catch(()=>false)) {ready=true;break;}
    await delay(400);
  }
  assert(ready,'本机独立模型未就绪');
  process.env.LLM_API_KEY=secret;process.env.LLM_BASE_URL=upstream+'/v1';process.env.LLM_MODEL=evidence.model;
  globalThis.fetch=async(url,options)=>{
    const response=await originalFetch(url,options);
    if(url===upstream+'/v1/chat/completions') {
      const body=await response.clone().json();
      const spec=JSON.parse(options.body);
      evidence.inference.push({status:response.status,usage:body.usage,systemCharacters:spec.messages[0].content.length,modelOutput:body.choices?.[0]?.message?.content});
    }
    return response;
  };
  const port=await listen(app);
  Object.assign(evidence,{applicationPort:port,inferencePort,contextWindow:8192,gpuLayers:Number(process.env.DEMO_GPU_LAYERS || '0')});
  async function ask(message,image) {
    const before=evidence.inference.length;
    const response=await originalFetch('http://127.0.0.1:'+port+'/api/ai/scene-command',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({message,image,sceneDocument,selection})});
    const plan=await response.json();
    evidence.cases.push({message,image:Boolean(image),status:response.status,realModelCalls:evidence.inference.length-before,plan});
    assert.equal(response.status,200,JSON.stringify(plan));
    assert(plan.requiresConfirmation && plan.warnings.length);
    return plan;
  }
  const move=await ask('只把选中的奶油色双人沙发向右移动20厘米，保持前后位置和高度。');
  assert.equal(move.commands.length,1);
  assert.equal(move.commands[0].placementId,placements[119].id);
  assert(Math.abs(move.commands[0].position.x-placements[119].position.x-.2)<.001);
  const swatch=await fs.readFile('docs/verification/v2/local-ai/材料色样.png');
  const prompt='请根据参考图片的主色，把书房的原木茶几改成该颜色，仅改这张茶几。请生成可预览的改色命令。';
  const image='data:image/png;base64,'+swatch.toString('base64');
  const rgb=await sharp(swatch).removeAlpha().resize(1,1).raw().toBuffer();
  const palette='\n图片中按像素占比从高到低的参考色为 #'+rgb.toString('hex')+'。如要求修改家具颜色，请根据画面选择与要求匹配的真实色值，用 set_material 的 color 字段生成方案；仅用户要求更换材料时才用 materialId。界面会让用户确认方案。';
  let tint=await ask(prompt+palette,image);
  if(!tint.commands.length && tint.questions.length) {
    tint=await ask('先前要求：'+prompt+'\n助手对该要求的提问：'+tint.questions.join('；')+'\n用户的新回复：确认使用你识别出的颜色，请生成改色命令供我预览。'+palette,image);
  }
  assert.equal(tint.commands.length,1,JSON.stringify(tint));
  const cmd=tint.commands[0];assert.equal(cmd.type,'set_material');assert.equal(cmd.targetId,placements[118].id);
  const [red,green,blue]=cmd.color.slice(1).match(/../g).map(x=>parseInt(x,16));assert(blue>red+25 && blue>green+10);
  const batch=await ask('将全屋所有家具统一改为蓝色。');
  assert.deepEqual(batch.commands,[]);assert(batch.questions.length);
  assert(evidence.cases.slice(0,-1).every(c=>c.realModelCalls===1));
  assert.equal(evidence.cases.at(-1).realModelCalls,0);
  assert(evidence.inference.every(x=>x.usage.prompt_tokens+x.usage.completion_tokens<8192));
  evidence.passed=true;
} finally {
  globalThis.fetch=originalFetch;
  await fs.writeFile(path.join(out,'large-home-ai.json'),JSON.stringify(evidence,null,2));
  if(app.listening) await new Promise(resolve=>app.close(resolve));
  model.kill();await Promise.race([exited,delay(5000)]);
  console.log(path.join(out,'large-home-ai.json'),evidence.passed===true?'通过':'未通过');
}
