import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
const root = path.resolve('data/lux3d-v2/commerce');

export async function quoteItems(items) {
  if (!items.length || items.length > 50) throw Error('报价批次大小无效');
  const skill = process.env.LUX3D_SKILL_DIR;
  const python = process.env.LUX3D_PYTHON;
  if (!skill || !python) throw Error('缺少 Aholo 技能运行环境');
  await fs.mkdir(root,{recursive:true});
  const journal = path.join(root,'logs/collection.sqlite');
  const cli = async args => {
    try {
      const {stdout} = await run(python,[path.join(skill,'scripts/commerce.py'),...args,'--region','cn','--host-name','Codex','--model-name','GPT-6','--journal',journal],{env:{...process.env,LUX3D_CN_API_KEY:process.env.AHOLO_API_KEY,PYTHONIOENCODING:'utf-8'}});
      return JSON.parse(stdout);
    } catch { throw Error('中国区报价或受理记录未能确认，已停止新提交'); }
  };
  const init = await cli(['init']);
  const version = Date.now();
  const dir = path.join(root,String(version));
  await fs.mkdir(dir);
  const calls = {};
  for (const [index,item] of items.entries()) {
    const image = item.mode === 'image';
    const body = {version:'G1',faceCount:60000,outputFormat:['glb'],aiPredictSize:false};
    if (image) body.img = item.source.inputPublicUrl;
    else body.prompt = item.prompt;
    calls[index+1] = {endpoint:{method:'POST',path:'/lux3d/v1/generate/'+(image?'img':'text')+'-to-3d/task/create'},parameters:{body}};
  }
  const plan = 'DREAMHOME 独立家具滚动批次。生成完整单件、检查实际GLB、尺寸、朝向、地面接触、外观、预览、平面图和场景，再发布通过件。每项 G1、60000 面、GLB。\n'+items.map((a,i)=>(i+1)+'. '+a.name+' '+(a.prompt||a.source?.sourceUrl)).join('\n');
  const review = {pluginTaskId:init.pluginTaskId,planVersion:Math.floor(version/1000),plan};
  const save = (name,obj) => fs.writeFile(path.join(dir,name),JSON.stringify(obj,null,2));
  await save('review.json',review); await save('items.json',calls);
  const {quote,account} = await cli(['quote','--items',path.join(dir,'items.json'),'--review',path.join(dir,'review.json')]);
  await save('receipt.json',{quote,account});
  return new Map(items.map((a,i)=>[a.name,{cost:quote.details[i+1],quoteId:quote.quoteId,expiresAt:quote.expiresAt,planVersion:review.planVersion}]));
}
