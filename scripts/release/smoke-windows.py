"""Extract one Windows ZIP, start its real launcher and verify its bundled runtime and library."""
import argparse
import csv
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
import zipfile

HERE = Path(__file__).resolve().parent

def read_json(url):
    with urlopen(url,timeout=6) as response: return json.load(response)

def sha(path):
    with path.open('rb') as handle: return hashlib.file_digest(handle,'sha256').hexdigest()

def smoke(archive_path, evidence_dir):
    evidence_dir.mkdir(exist_ok=True,parents=True)
    environment={k:v for k,v in os.environ.items() if not k.upper().startswith(('AHOLO_','LLM_','LUX3D_','LLAMA_','NODE_','DREAMHOME_'))}
    digest=sha(archive_path)
    assert archive_path.with_suffix('.zip.sha256').read_text(encoding='utf-8').split()[0] == digest
    with tempfile.TemporaryDirectory(prefix='dreamhome-win-clean-') as tmp:
        root=Path(tmp).resolve()
        assert root.parent==Path(tempfile.gettempdir()).resolve()
        with zipfile.ZipFile(archive_path) as archive:
            names=archive.namelist()
            assert 'runtime/node.exe' in names and 'scripts/release/start-studio.ps1' in names
            assert not any(n.startswith(('data/projects/','data/jobs/','data/uploads/','data/local-ai/','.git/')) or Path(n).name in ('.env','batch.lock') for n in names)
            for member in names:
                if not (root/member).resolve().is_relative_to(root): raise ValueError('ZIP 路径越界')
            archive.extractall(root)
        snapshot_file=root/'docs/verification/release-snapshot.json'
        if snapshot_file.is_file():
            snapshot=json.loads(snapshot_file.read_text(encoding='utf-8'))
            for field,rel in [('indexSHA256','data/library/index.json'),('creditReservationsSHA256','data/lux3d-v2/reservations.json'),('creditCsvSHA256','docs/LUX3D_CREDIT_LEDGER.csv')]:
                assert sha(root/rel)==snapshot[field]
            for field,rel in [('licenseCsvSHA256','docs/ASSET_LICENSE_LEDGER.csv'),('reviewSHA256','docs/verification/v2/lux3d-reviewed.json')]:
                if field in snapshot: assert sha(root/rel)==snapshot[field]
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1',0)); port=reservation.getsockname()[1]
        base='http://127.0.0.1:'+str(port)
        log=evidence_dir/'portable-launch.txt'
        executable=root/'runtime/node.exe'
        with log.open('wb') as stream:
            service=subprocess.Popen([environment['COMSPEC'],'/d','/c','启动DREAMHOME.cmd','-Port',str(port),'-NoBrowser','-NoLocalAI'],cwd=root,env=environment,stdout=stream,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                for attempt in range(65):
                    if service.poll() is not None: raise RuntimeError('启动器提前退出，见 portable-launch.txt')
                    try: health=read_json(base+'/api/health'); break
                    except OSError: time.sleep(.4)
                else: raise RuntimeError('启动器未提供健康响应')
                assert health['application']=='DREAMHOME V2'
                assert not health['lux3dConfigured'] and not health['llmConfigured']
                catalog=read_json(base+'/api/library/index.json')
                if snapshot_file.is_file():
                    assert len(catalog['assets'])==snapshot['models'] and len(catalog['materials'])==snapshot['materials']
                with (root/'docs/ASSET_LICENSE_LEDGER.csv').open(encoding='utf-8-sig',newline='') as stream:
                    license_rows=list(csv.DictReader(stream))
                model_licenses={r['ID']:r['SHA256'] for r in license_rows if r['类型']=='3D模型'}
                assert model_licenses=={a['id']:a['archive']['sha256'] for a in catalog['assets']}
                for row in license_rows:
                    for path_key,sha_key in [('本地原图','SHA256'),('本地裁剪图','裁剪图SHA256')]:
                        if row.get(path_key):
                            source=(root/row[path_key]).resolve()
                            assert source.is_relative_to(root) and sha(source)==row[sha_key]
                if snapshot_file.is_file() and 'reviewSHA256' in snapshot:
                    reviewed=json.loads((root/'docs/verification/v2/lux3d-reviewed.json').read_text(encoding='utf-8'))
                    assert snapshot['lux3dArchived']==len(reviewed['items'])==sum(bool(a.get('providerTaskId')) for a in catalog['assets'])
                    assert snapshot['lux3dStrictReady']==sum(r['strictReady'] for r in reviewed['items'])
                for asset in catalog['assets']:
                    file=root/'data/library/models'/asset['id']/'model.glb'
                    assert sha(file)==asset['archive']['sha256']
                    definition=json.loads((file.parent/'asset.json').read_text(encoding='utf-8-sig'))
                    assert definition['archive']['sha256']==asset['archive']['sha256'] and definition.get('planThumbnailUrl')==asset.get('planThumbnailUrl')
                with urlopen(base+catalog['assets'][0]['modelUrl']) as r: assert r.read(4)==b'glTF'
                with urlopen(base+catalog['assets'][0]['thumbnailUrl']) as r: assert r.read(8)==b'\x89PNG\r\n\x1a\n'
                plan_count=0
                for a in catalog['assets']:
                    if a.get('planThumbnailUrl'):
                        plan=root/'data/library/models'/a['id']/'plan.png'
                        with plan.open('rb') as stream: head=stream.read(26)
                        assert head[:8]==b'\x89PNG\r\n\x1a\n' and head[25] in (4,6)
                        proof=a.get('planThumbnail',{})
                        if proof.get('sha256'): assert sha(plan)==proof['sha256']
                        if proof.get('width'): assert int.from_bytes(head[16:20],'big')==proof['width']
                        if proof.get('height'): assert int.from_bytes(head[20:24],'big')==proof['height']
                        plan_count+=1
                if snapshot_file.is_file(): assert plan_count==snapshot['planThumbnails']
                if plan_count:
                    url=next(a['planThumbnailUrl'] for a in catalog['assets'] if a.get('planThumbnailUrl'))
                    with urlopen(base+url) as r: assert r.read(8)==b'\x89PNG\r\n\x1a\n'
                map_url=next(m['url'] for mat in catalog['materials'] for m in mat.get('maps',{}).values())
                with urlopen(base+map_url) as r: assert r.read(2)==b'\xff\xd8'
                with urlopen(base+'/api/library/hdris/white_home_studio_2k.hdr') as r: assert r.read(10).startswith(b'#?')
                with urlopen(base+'/room-references/corner-windows.jpg') as r: assert r.read(2)==b'\xff\xd8'
                tests=subprocess.run([str(executable),'--test'],cwd=root,env=environment,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
                (evidence_dir/'portable-unit.txt').write_bytes(tests.stdout)
                tests.check_returncode()
                browser_env={**environment,'DEMO_URL':base,'DEMO_OUTPUT':str(evidence_dir)}
                script=root/'scripts/release/verify-portable.mjs'
                # During a preview, the current test driver can also verify an earlier archive without changing any files in it.
                source=(script if script.exists() else HERE/'verify-portable.mjs').read_text(encoding='utf-8-sig').replace('../../src/data/demo-scene.js','./src/data/demo-scene.js')
                subprocess.run([str(executable),'--input-type=module'],input=source.encode('utf-8'),cwd=root,env=browser_env,check=True,timeout=450)
                report={'passed':True,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'archive':archive_path.name,'sha256':digest,'compressedBytes':archive_path.stat().st_size,'files':len(names),'launcher':'启动DREAMHOME.cmd → start-studio.ps1 → runtime/node.exe','node':subprocess.check_output([str(executable),'--version'],text=True).strip(),'serverFiles':['index','GLB','thumbnail','PBR','HDRI','room photo'],'modelsHashVerified':len(catalog['assets']),'materials':len(catalog['materials']),'planThumbnailsVerified':plan_count,'cloudCredentialsPresent':False,'unitTests':'portable-unit.txt','browserChecks':'portable-browser.json'}
                (evidence_dir/'portable-package.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps(report,ensure_ascii=False))
            finally:
                subprocess.run(['taskkill','/pid',str(service.pid),'/t','/f'],capture_output=True)
                service.wait(timeout=12)

if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('archive',type=Path)
    cli.add_argument('--evidence',type=Path,required=True)
    args=cli.parse_args()
    smoke(args.archive.resolve(),args.evidence.resolve())
