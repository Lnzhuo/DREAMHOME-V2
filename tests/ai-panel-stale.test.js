import test from 'node:test';
import assert from 'node:assert/strict';
import { AIAssistantPanel } from '../src/ai/AIAssistantPanel.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const preview = { hidden:false }; let scene = { projectId:'a', value:1 };
  const panel = new AIAssistantPanel({ root:{ querySelector: s => s === '[data-ai-image]' ? { files: [] } : preview }, executor:{ editor:{ getSceneDocument:() => scene } } });
  panel.messages=[]; panel.message=(text)=>panel.messages.push(text); panel.showPreview=(plan)=>{panel.shown=plan;};
  return {panel, setScene: next=>{scene=next;}};
}
test('late concurrent AI responses cannot replace a newer plan', async () => {
  const saved=globalThis.fetch; const requests=[];
  globalThis.fetch=async (url)=> url==='/api/library/index.json' ? {ok:true,json:async()=>({assets:[],materials:[]})} : new Promise(resolve=>requests.push(resolve));
  try {
    const {panel}=setup(); const old=panel.send('old'); await flush(); const next=panel.send('new'); await flush();
    requests[1]({ok:true,json:async()=>({summary:'new'})}); await next;
    requests[0]({ok:true,json:async()=>({summary:'old'})}); await old;
    assert.equal(panel.pendingPlan.summary,'new'); assert.equal(panel.shown.summary,'new');
  } finally { globalThis.fetch=saved; }
});
test('response from a previous project is discarded', async () => {
  const saved=globalThis.fetch; let respond;
  globalThis.fetch=async (url)=> url==='/api/library/index.json' ? {ok:true,json:async()=>({assets:[],materials:[]})} : new Promise(resolve=>{respond=resolve;});
  try { const {panel,setScene}=setup(); const request=panel.send('test'); await flush(); setScene({projectId:'b',value:1}); respond({ok:true,json:async()=>({summary:'stale'})}); await request; assert.equal(panel.pendingPlan,null); assert.match(panel.messages.at(-1),/项目已发生变化/); }
  finally { globalThis.fetch=saved; }
});
