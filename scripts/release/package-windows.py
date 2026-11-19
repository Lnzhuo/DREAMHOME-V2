"""Create the self-contained Windows release from the installed project and its accepted asset catalog."""
import argparse
import csv
import io
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ZIP_NAME = 'DREAMHOME_V2_Windows.zip'
DELIVERY = Path('D:/c1/比赛项目/DREAMHOME_V2_交付')
PRIV_DIRS = {'.git', '.vite', '.vite-temp', '__pycache__', '.playwright-cli','windows-preview'}
BLOCKED_SUFFIXES = {'.log', '.pyc', '.gguf', '.safetensors', '.onnx', '.lock', '.pem', '.key', '.pfx'}
BINARY = {'.glb','.png','.jpg','.webm','.hdr','.exe','.dll','.node','.zip','.gz','.webp'}
REQUIRED_DOCS = ['DREAMHOME_V2_PRODUCT_BLUEPRINT.md','ASSET_LIBRARY_SPEC.md','ASSET_LICENSE_LEDGER.csv','LUX3D_CREDIT_LEDGER.csv','ROOM_TEMPLATE_CATALOG.md','BYOK_SECURITY_SPEC.md','DREAMHOME_V2_ACCEPTANCE.md','DREAMHOME_V2_FINAL_REPORT.md']

def allowed(path):
    return (not any(part in PRIV_DIRS for part in path.parts)
            and path.suffix.lower() not in BLOCKED_SUFFIXES
            and not (path.name.startswith('page@') and path.suffix.lower()=='.webm')
            and path.name not in {'.npmrc','.env','failure.png','batch.lock'}
            and (not path.name.startswith('.env.') or path.name == '.env.example'))

def get_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def catalog_snapshot(path):
    catalog=get_json(path)
    assets=catalog['assets']
    def complete(a):
        return all(a.get(url) and (a.get(field) or {}).get('sha256') for url,field in [('thumbnailUrl','thumbnail'),('planThumbnailUrl','planThumbnail')])
    if any(complete(a) for a in assets):
        cutoff=time.monotonic()+90
        while any(not complete(a) for a in assets) and time.monotonic()<cutoff:
            time.sleep(2)
            current={a['id']:a for a in get_json(path)['assets']}
            for i,asset in enumerate(assets):
                candidate=current.get(asset['id'])
                if not complete(asset) and candidate and complete(candidate) and candidate['archive']['sha256']==asset['archive']['sha256']:
                    assets[i]=candidate
    missing=[a['name'] for a in assets if not complete(a)]
    if missing: raise ValueError('等待模型预览图与俯视图烘焙完成后打包：'+'、'.join(missing))
    return catalog,json.dumps(catalog,ensure_ascii=False,indent=2).encode('utf-8')

def frozen_reports(files,contents,index,node):
    with tempfile.TemporaryDirectory(prefix='dreamhome-release-report-') as temporary:
        root=Path(temporary)
        required=['data/library/index.json','data/library/hdris/white_home_studio.json','data/lux3d-v2/reservations.json','docs/LUX3D_CREDIT_LEDGER.csv','docs/verification/v2/browser-checks.json','docs/verification/v2/residence/residence-checks.json']
        ai='docs/verification/v2/local-ai/ai-e2e.json'
        if ai in files: required.append(ai)
        combined='docs/verification/v2/portable-local-ai/combined-pack.json'
        if combined in files: required.append(combined)
        for evidence in ['docs/verification/v2/residence/large-home-ai.json','docs/verification/v2/residence/apartment-ai.json','docs/verification/v2/portable-local-ai/replay/replayed-pack.json','docs/verification/v2/portable-local-ai/live-cpu-response.json']:
            if evidence in files: required.append(evidence)
        required+=['src/data/v2-contracts.js','src/data/villa-site.js','src/data/scene-operations.js','src/data/scene-document.js','package.json','data/library/new-lux3d-progress.json']
        required+=['scripts/assets/write-ledger.py','scripts/assets/room-references-extra.json']
        required.extend(name for name in files if name.startswith('assets/source/room-references/'))
        required.extend(name for name in files if name.startswith('public/room-references/'))
        required.extend(name for name in files if name.startswith('data/library/snapshots/') or name in ['data/library/frozen-pixel-validation.json','data/library/frozen-post-validation.json','data/library/validation-frozen-report.json'])
        required.extend(name for name in files if name.startswith('data/library/') and (name.endswith('-e2e.json') or name.startswith('data/library/lux-qa/') and name.endswith('.json')))
        for name in required:
            value=contents[name] if name in contents else files[name].read_bytes()
            path=root/name
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(value)
        subprocess.run([sys.executable,str(root/'scripts/assets/write-ledger.py')],cwd=root,check=True)
        subprocess.run([sys.executable,str(ROOT/'scripts/release/write-verification-summary.py')],cwd=ROOT,env={**os.environ,'DREAMHOME_REPORT_ROOT':str(root),'DREAMHOME_REPORT_NODE':str(node)},check=True)
        for name in ['docs/ASSET_LICENSE_LEDGER.csv','docs/DREAMHOME_V2_ACCEPTANCE.md','docs/DREAMHOME_V2_FINAL_REPORT.md','docs/verification/v2/unit-tests.txt','docs/verification/v2/lux3d-reviewed.json']:
            contents[name]=(root/name).read_bytes()
            files.setdefault(name,ROOT/name)
        spec='docs/ASSET_LIBRARY_SPEC.md'
        counts={provider:sum(a.get('provider')==provider for a in index['assets']) for provider in ['polyhaven','kenney','aholo-lux3d']}
        size=f"{len(index['assets'])} 件 GLB（Poly Haven {counts['polyhaven']} 件、Kenney {counts['kenney']} 件、Lux3D {counts['aholo-lux3d']} 件）、{sum(bool(a.get('thumbnailUrl')) for a in index['assets'])} 张实际渲染的 512×512 PNG 和 {len(index['materials'])} 种室内材料"
        contents[spec]=re.sub(r'\d+ 件 GLB（Poly Haven \d+ 件、Kenney \d+ 件、Lux3D \d+ 件）、\d+ 张实际渲染的 512×512 PNG 和 \d+ 种室内材料',size,contents[spec].decode('utf-8')).encode('utf-8')
        launcher=files['scripts/release/start-studio.ps1'].read_text(encoding='utf-8-sig')
        port=re.search(r'\$Port\s*=\s*(\d+)',launcher).group(1)
        guide='开始使用.txt'
        contents[guide]=re.sub(r'127\.0\.0\.1:\d+',f'127.0.0.1:{port}',files[guide].read_text(encoding='utf-8')).encode('utf-8')

def frozen_credit_data(root):
    # Task records are written by atomic rename. The CSV's provider costs may refresh less frequently.
    ledger_file=root/'data/lux3d-v2/reservations.json'
    csv_file=root/'docs/LUX3D_CREDIT_LEDGER.csv'
    raw=ledger_file.read_bytes()
    tasks=json.loads(raw)
    rows=list(csv.reader(io.StringIO(csv_file.read_text(encoding='utf-8-sig'))))
    header=rows[0]
    original_ids={'8394445','8395285','8396095'}
    historical=[r for r in rows[1:] if len(r)>=9 and (r[3] in original_ids or not r[3] and r[2] not in {e['name'] for e in tasks}
                  and r[4] not in ('reserved','submitted','archived','uncertain_or_failed'))]
    by_id={r[3]:r for r in rows[1:] if len(r)>=9 and r[3]}
    result=[header,*historical]
    for task in tasks:
        tid=str(task.get('taskId') or '')
        existing=by_id.get(tid)
        actual=task.get('actualCredits')
        proof=(existing[8] if existing else '') or '冻结记录；实际费用待对账'
        if actual is None: actual=existing[6] if existing and existing[6] else '待对账'
        result.append([(task.get('createdAt') or '')[:10],'平台',task['name'],tid,task['status'],
            task.get('expectedCredits'),actual,'',proof])
    stream=io.StringIO(newline='')
    csv.writer(stream,quoting=csv.QUOTE_ALL,lineterminator='\n').writerows(result)
    return raw,stream.getvalue().encode('utf-8-sig')

def package(output, preview, node_root):
    node = node_root / 'node.exe'
    license_file = node_root / 'LICENSE'
    if not node.is_file() or not license_file.is_file():
        raise ValueError('请指定完整的 Windows Node 发行目录（含 node.exe 和对应 LICENSE）')
    # Build in a dedicated folder so an active development/production server keeps serving its current files.
    build_dir = tempfile.TemporaryDirectory(prefix='dreamhome-release-dist-')
    dist = Path(build_dir.name)
    subprocess.run([str(node),'node_modules/vite/bin/vite.js','build','--outDir',str(dist)],cwd=ROOT,check=True)
    # ZIP is built from an allowlist. Source projects, uploads, live jobs, node caches and weights are never selected.
    files = {}
    fixed_contents = {}
    expected_hashes = {}
    def add(path, name=None):
        if not path.is_file(): raise FileNotFoundError(path)
        if path.is_symlink() or not allowed(path): return
        files[name or path.relative_to(ROOT).as_posix()] = path
    def tree(directory):
        if not directory.is_dir(): raise FileNotFoundError(directory)
        for base, dirs, names in os.walk(directory,followlinks=False):
            dirs[:] = [d for d in dirs if d not in PRIV_DIRS and not (Path(base)/d).is_symlink()]
            for name in names: add(Path(base)/name)
    for name in ['src','server','scripts','tests','public','docs','node_modules']:
        tree(ROOT/name)
    files.pop('docs/verification/release-snapshot.json',None)
    for photo in get_json(ROOT/'scripts/assets/room-references-extra.json'):
        original=photo['originalPath']
        preview_path=photo['previewPath']
        if not re.fullmatch(r'assets/source/room-references/pexels-[0-9]+\.jpg',original):
            raise ValueError('参考照片路径无效')
        add(ROOT/original)
        expected_hashes[original]=photo['originalSha256']
        expected_hashes[preview_path]=photo['previewSha256']
    for file in dist.rglob('*'):
        if file.is_file(): add(file,'dist/'+file.relative_to(dist).as_posix())
    for name in ['启动DREAMHOME.cmd','开始使用.txt','index.html','package.json','package-lock.json','vite.config.js','.env.example','.gitignore']:
        add(ROOT/name)
    if not preview:
        for name in REQUIRED_DOCS: add(ROOT/'docs'/name)
        add(ROOT/'scripts/release/start-studio.ps1')
        add(ROOT/'docs/verification/v2/DREAMHOME-V2-demo.webm')
    lib = ROOT/'data/library'
    index_path = lib/'index.json'
    index,frozen_index=catalog_snapshot(index_path)
    add(index_path)
    fixed_contents['data/library/index.json']=frozen_index
    for model in index['assets']:
        ident = model['id']
        if not re.fullmatch(r'[\w-]+',ident,re.ASCII): raise ValueError('无效的目录资产标识')
        folder=lib/'models'/ident
        for filename in ['model.glb','thumbnail.png','asset.json']: add(folder/filename)
        if model.get('planThumbnailUrl'):
            if model['planThumbnailUrl'] != '/api/library/models/'+ident+'/plan.png': raise ValueError('家具平面缩略图与目录模型不一致')
            add(folder/'plan.png')
        expected_hashes[(folder/'model.glb').relative_to(ROOT).as_posix()]=model['archive']['sha256']
        for k,filename in [('thumbnail','thumbnail.png'),('planThumbnail','plan.png')]:
            if (model.get(k) or {}).get('sha256'): expected_hashes[(folder/filename).relative_to(ROOT).as_posix()]=model[k]['sha256']
        fixed_contents[(folder/'asset.json').relative_to(ROOT).as_posix()]=(folder/'asset.json').read_bytes()
        tree(folder)
    active_material_dirs=set()
    for material in index['materials']:
        maps=material.get('maps',{})
        map_digests={m['url']:m.get('sha256') for m in maps.values() if m.get('url')}
        urls=list(map_digests)
        if material.get('previewUrl','') and not material['previewUrl'].startswith('data:'): urls.append(material['previewUrl'])
        for url in urls:
            if not re.fullmatch(r'/api/library/materials/[\w-]+/[\w.-]+',url,re.ASCII): raise ValueError('材质地址不在资源库内')
            path=lib/url.removeprefix('/api/library/')
            add(path)
            if map_digests.get(url):
                expected_hashes[path.relative_to(ROOT).as_posix()]=map_digests[url]
            active_material_dirs.add(path.parent)
    for folder in active_material_dirs: tree(folder)
    tree(lib/'hdris')
    if (lib/'lux-qa').exists():
        for file in (lib/'lux-qa').glob('*.json'): add(file)
    for report_name in ['frozen-vertex-floor-e2e.json','frozen-pixel-validation.json','frozen-post-validation.json','validation-frozen-report.json']:
        report_path=lib/report_name
        if not report_path.is_file(): continue
        report=get_json(report_path)
        snapshot=lib/'snapshots'/Path(report['snapshot']).name
        add(report_path)
        add(snapshot)
        expected_hashes[snapshot.relative_to(ROOT).as_posix()]=report['snapshotSha256']
    for pattern in ['*-e2e.json','new-lux3d-progress.json','validation-report.json','plan-report.json','plan-validation.json','thumbnail-report.json','*size*report*.json','*scale*report*.json','contact-*.jpg']:
        for file in lib.glob(pattern): add(file)
    # Only the public financial reservation/quality records, never raw provider responses or session records.
    budgets=ROOT/'data/lux3d-v2'
    for pattern in ['reservations.json','*-quality.json','*-candidates.json']:
        for file in budgets.glob(pattern): add(file)
    add(budgets/'reservations.json')
    for name,file in files.items():
        if name.startswith('data/lux3d-v2/') or name.startswith('docs/') and file.suffix.lower() in ('.md','.csv'):
            fixed_contents[name]=file.read_bytes()
    frozen_budget,frozen_csv=frozen_credit_data(ROOT)
    fixed_contents['data/lux3d-v2/reservations.json']=frozen_budget
    fixed_contents['docs/LUX3D_CREDIT_LEDGER.csv']=frozen_csv
    for name,file in files.items():
        if name.startswith('data/library/') and file.suffix=='.json' and name not in fixed_contents:
            fixed_contents[name]=file.read_bytes()
    if not preview: frozen_reports(files,fixed_contents,index,node)
    snap_time=datetime.datetime.now(datetime.timezone.utc).isoformat()
    snapshot={'capturedAt':snap_time,'models':len(index['assets']),'materials':len(index['materials']),
        'planThumbnails':sum(bool(a.get('planThumbnailUrl')) for a in index['assets']),
        'indexSHA256':hashlib.sha256(frozen_index).hexdigest(),'creditReservationsSHA256':hashlib.sha256(frozen_budget).hexdigest(),
        'creditCsvSHA256':hashlib.sha256(frozen_csv).hexdigest(),'reservedTasks':len(json.loads(frozen_budget))}
    if not preview:
        review_file='docs/verification/v2/lux3d-reviewed.json'
        ready=json.loads(fixed_contents[review_file])
        snapshot.update({'lux3dArchived':ready['catalogued'],'lux3dStrictReady':ready['strictReady'],'reviewSHA256':hashlib.sha256(fixed_contents[review_file]).hexdigest(),'licenseCsvSHA256':hashlib.sha256(fixed_contents['docs/ASSET_LICENSE_LEDGER.csv']).hexdigest()})
    add(node, 'runtime/node.exe')
    add(license_file, 'runtime/LICENSE')
    # Runtime scripts may import build-time tools, so the release includes installed Windows dependency modules.
    # Offline rebuild: runtime\node.exe node_modules\vite\bin\vite.js build.
    secrets=[]
    config=ROOT/'.env'
    if config.is_file():
        for line in config.read_text(encoding='utf-8-sig').splitlines():
            k,sep,v=line.partition('=')
            if sep and re.search(r'(?:KEY|TOKEN|PASSWORD|SECRET)$',k.strip(),re.I):
                value=v.strip().strip('"\'').encode()
                if len(value)>=8: secrets.append(value)
    output.mkdir(parents=True,exist_ok=True)
    dest=output/ZIP_NAME
    with tempfile.NamedTemporaryFile(dir=output,suffix='.zip.tmp',delete=False) as handle:
        tmp=Path(handle.name)
    try:
        with zipfile.ZipFile(tmp,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=2,allowZip64=True) as archive:
            archive.writestr('docs/verification/release-snapshot.json',json.dumps(snapshot,ensure_ascii=False,indent=2))
            for name,path in sorted(files.items()):
                data=fixed_contents[name] if name in fixed_contents else path.read_bytes()
                if name in expected_hashes and hashlib.sha256(data).hexdigest()!=expected_hashes[name]:
                    raise ValueError('资源文件与定版索引的 SHA-256 不一致：'+name)
                if any(value in data for value in secrets): raise ValueError('包内文件发现服务器凭据，停止打包：'+name)
                archive.writestr(name,data,compress_type=zipfile.ZIP_STORED if path.suffix.lower() in BINARY else zipfile.ZIP_DEFLATED,compresslevel=2)
        os.replace(tmp,dest)
    finally:
        tmp.unlink(missing_ok=True)
    with dest.open('rb') as handle: digest=hashlib.file_digest(handle,'sha256').hexdigest()
    build_dir.cleanup()
    dest.with_suffix('.zip.sha256').write_text(digest+'  '+ZIP_NAME+'\n',encoding='utf-8')
    print(json.dumps({'file':str(dest),'files':len(files)+1,'models':len(index['assets']),'materials':len(index['materials']),'bytes':dest.stat().st_size,'sha256':digest},ensure_ascii=False))

if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--output',type=Path,default=DELIVERY)
    cli.add_argument('--preview',action='store_true',help='允许预演时最终报告或启动脚本仍在整理')
    cli.add_argument('--node-dir',type=Path)
    args=cli.parse_args()
    bundled=ROOT/'runtime'
    node_dir=args.node_dir or (bundled if (bundled/'node.exe').is_file() else Path(shutil.which('node') or '').parent)
    if not (node_dir/'LICENSE').is_file() and not args.node_dir:
        version=subprocess.check_output([str(node_dir/'node.exe'),'--version'],text=True).strip()
        node_dir=Path(os.environ['LOCALAPPDATA'])/'Programs/nodejs-portable'/('node-'+version+'-win-x64')
    package(args.output.resolve(),args.preview,node_dir.resolve())
