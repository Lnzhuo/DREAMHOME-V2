"""Extract the Windows editor and its optional model pack together; exercise their real local inference through Edge."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from zipfile import ZipFile

WEIGHTS={
    'Qwen3VL-4B-Instruct-Q4_K_M.gguf':'66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a',
    'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf':'30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d',
}

def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()

def unpack(archive,root):
    with ZipFile(archive) as z:
        for member in z.namelist():
            if not (root/member).resolve().is_relative_to(root) or (root/member).exists():
                raise ValueError('解压路径重复或越界：'+member)
        z.extractall(root)

def verify(editor,extension,evidence,layers,replay=None):
    evidence.mkdir(parents=True,exist_ok=True)
    env={k:v for k,v in os.environ.items() if not k.upper().startswith(('AHOLO_','LLM_','LUX3D_','LLAMA_','DREAMHOME_','NODE_'))}
    with tempfile.TemporaryDirectory(prefix='dreamhome-clean-editor-ai-') as directory:
        root=Path(directory).resolve()
        unpack(editor,root)
        assert not (root/'data/local-ai').exists() and not (root/'.env').exists()
        unpack(extension,root)
        for name,expected in WEIGHTS.items(): assert digest(root/'data/local-ai'/name)==expected
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        url=f'http://127.0.0.1:{port}'
        launch=evidence/'portable-ai-launch.txt'
        with launch.open('wb') as stream:
            flags=['-NoLocalAI'] if replay else ['-GpuLayers',str(layers)]
            proc=subprocess.Popen([env['COMSPEC'],'/d','/c','启动DREAMHOME.cmd','-Port',str(port),'-NoBrowser',*flags],cwd=root,env=env,creationflags=subprocess.CREATE_NO_WINDOW,stdout=stream,stderr=subprocess.STDOUT)
            try:
                for _ in range(125):
                    if proc.poll() is not None: raise RuntimeError('本地启动器提前退出')
                    try:
                        with urlopen(url+'/api/health',timeout=1) as response: health=json.load(response)
                        break
                    except OSError: time.sleep(.5)
                else: raise RuntimeError('编辑器启动超时')
                assert health['application']=='DREAMHOME V2' and bool(health['llmConfigured'])==(replay is None) and not health['lux3dConfigured']
                if not replay: assert b'Local Qwen vision-language inference is ready' in launch.read_bytes()
                browser_env={**env,'DEMO_URL':url,'DEMO_OUTPUT':str(evidence),'DEMO_LOCAL_ONLY':'1','DEMO_CHECK_STATE_ONLY':'1','RECORD_DEMO':''}
                if replay: browser_env['DEMO_REPLAY_FILE']=str(replay.resolve())
                driver='verify-replayed-plan.mjs' if replay else 'verify-local-ai.mjs'
                subprocess.run([str(root/'runtime/node.exe'),str(root/'scripts/release'/driver)],cwd=root,env=browser_env,check=True,timeout=600)
                run=json.loads((evidence/'ai-e2e.json').read_text(encoding='utf-8'))
                assert run['cases'][0]['appliedAndUndone'] and run['cases'][-1]['appliedAndRestored'] and not run['pageErrors']
                result={'passed':True,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'editorZipSHA256':digest(editor),'extensionZipSHA256':digest(extension),'weightSHA256':WEIGHTS,'gpuLayers':layers,'separateLocalPort':port,'weightsExtractedFromZip':True,'runtime':'ZIP 内的 Node、llama-server、Qwen3VL、视觉投影器；独立临时目录启动','externalCloudCredentials':False,'browserResult':'ai-e2e.json'}
                if replay:
                    assert run.get('responseMode') and run['cases'][-1].get('persistedInIndexedDB')
                    result.update({'mode':'真实双包响应回放，单独复验 IndexedDB 与关页重开','responseSHA256':digest(replay),'runtime':'ZIP 内 Node，模型权重从正式扩展 ZIP 解压并校验，本轮未调用推理进程'})
                (evidence/('replayed-pack.json' if replay else 'combined-pack.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps(result,ensure_ascii=False))
            finally:
                subprocess.run(['taskkill','/pid',str(proc.pid),'/t','/f'],capture_output=True)
                proc.wait(timeout=15)
                # Windows can keep an executable or mapped GGUF briefly locked after process-tree exit.
                for attempt in range(30):
                    try:
                        (root/'data/local-ai/runtime/ggml-base.dll').unlink(missing_ok=True)
                        break
                    except PermissionError: time.sleep(.25)

if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('editor',type=Path)
    cli.add_argument('extension',type=Path)
    cli.add_argument('--evidence',type=Path,required=True)
    cli.add_argument('--gpu-layers',type=int,default=0)
    cli.add_argument('--recorded-run',type=Path,help='只回放已记录的真实响应，独立验证编辑和恢复，不将结果记为实时推理')
    args=cli.parse_args()
    verify(args.editor.resolve(),args.extension.resolve(),args.evidence.resolve(),args.gpu_layers,args.recorded_run)
