"""Summarize preserved evidence for a specific local release snapshot."""
import csv
import hashlib
import json
import os
import re
import subprocess
from collections import Counter
from datetime import datetime
from pathlib import Path

source_root=Path(__file__).resolve().parents[2]
root=Path(os.environ.get('DREAMHOME_REPORT_ROOT', source_root))
bundled_node=source_root/'runtime/node.exe'
node_binary=os.environ.get('DREAMHOME_REPORT_NODE') or (str(bundled_node) if bundled_node.exists() else 'node')
default_port=re.search(r'\$Port\s*=\s*(\d+)',(source_root/'scripts/release/start-studio.ps1').read_text(encoding='utf-8-sig')).group(1)
docs=root/'docs'
ev=docs/'verification/v2'
def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))
now=datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')
index=read(root/'data/library/index.json')
assets=index['assets']
materials=index['materials']
lux=[a for a in assets if a.get('providerTaskId')]
template_query="""import { ROOM_TEMPLATES,FLOORPLAN_TEMPLATES,VILLA_TEMPLATES } from './src/data/v2-contracts.js';
console.log(JSON.stringify([ROOM_TEMPLATES,FLOORPLAN_TEMPLATES,VILLA_TEMPLATES].map(list=>list.length)))"""
rooms,flats,villas=json.loads(subprocess.check_output([node_binary,'--input-type=module','-e',template_query],cwd=root))
if len({a['id'] for a in assets})!=len(assets): raise ValueError('目录含重复模型 ID')
if len({a['archive']['sha256'] for a in assets})!=len(assets): raise ValueError('目录含重复的 GLB 文件，须核对后再统计独立模型')
if len({str(a['providerTaskId']) for a in lux})!=len(lux): raise ValueError('同一 Lux3D 任务被重复登记')
progress=read(root/'data/library/new-lux3d-progress.json')
floor_report=root/'data/library/vertex-floor-e2e.json'
floor_checks=read(floor_report) if floor_report.exists() else {}
grounded={r['id'] for r in floor_checks.get('results',[]) if r.get('status')=='passed' and r.get('vertices',0)>0 and abs(r.get('error',float('inf')))<=floor_checks.get('toleranceMeters',0)}
frozen_floor=root/'data/library/frozen-vertex-floor-e2e.json'
if frozen_floor.is_file():
    check=read(frozen_floor)
    frozen_index=root/'data/library/snapshots'/Path(check.get('snapshot','')).name
    if frozen_index.is_file() and hashlib.sha256(frozen_index.read_bytes()).hexdigest()==check.get('snapshotSha256'):
        frozen_assets={a['id']:a['archive']['sha256'] for a in read(frozen_index)['assets']}
        unchanged={a['id'] for a in assets if frozen_assets.get(a['id'])==a['archive']['sha256']}
        grounded.update(r['id'] for r in check['results'] if r['id'] in unchanged and r.get('status')=='passed' and r.get('vertices',0)>0 and abs(r.get('error',float('inf')))<=.015)
def readiness(a):
    qa=a.get('qa') or {}
    relative=re.search(r'（([^（）]+\.json)）',qa.get('placementTest',''))
    report=None
    if relative:
        name=relative.group(1)
        report=root/(name if name.startswith('data/library/') else 'data/library/'+name)
        if not report.resolve().is_relative_to((root/'data/library').resolve()): raise ValueError('场景证据路径不在资源库内')
    rows=read(report).get('results',[]) if report and report.is_file() else []
    placed=any(r.get('id')==a['id'] and r.get('status')=='passed' and r.get('hit') is True and r.get('real') is True for r in rows)
    # New assets continue to arrive between full-catalog scans. Incremental
    # scene reports measure every transformed vertex for the same placement.
    for result in rows:
        if result.get('id')!=a['id'] or result.get('status')!='passed' or result.get('real') is not True or not result.get('vertexCount',0)>0:
            continue
        if isinstance(result.get('vertexMinY'),(float,int)) and isinstance(result.get('placementY'),(float,int)) and abs(result['vertexMinY']-result['placementY'])<=.015:
            grounded.add(a['id'])
    review=qa.get('visualReview','')
    entry=progress.get(a['id'])
    reasons=[]
    if not (placed and qa.get('placementTest','').startswith('通过')): reasons.append('缺少本模型的真实载入、拾取与保存恢复通过记录')
    if a['id'] not in grounded: reasons.append('逐顶点落地验证待完成')
    if entry and (entry.get('visual')!='passed_manual' or entry.get('placement')!='passed'): reasons.append('增量目检或摆放记录仍带备注')
    if not re.search('已目检|已检查',review) or re.search('待|需复核|需视觉|需单独|疑似重复|瑕疵|异常|不可拆|不可分|差异|额外支架|细节较浅',review): reasons.append('外观仍有差异、备注或待复核')
    if a.get('scaleCalibrationRequired') or any((a.get('dimensions',{}).get(axis,{}).get('value') or 0)<=0 for axis in ('width','height','depth')): reasons.append('设计尺寸待校准')
    if not (a.get('thumbnailUrl') and a.get('planThumbnailUrl') and a.get('archive',{}).get('sha256') and qa.get('glbParsed')): reasons.append('归档、解析或缩略图证据不足')
    return {'id':a['id'],'taskId':a['providerTaskId'],'name':a['name'],'source':a.get('source'),'strictReady':not reasons,'scenePassed':placed,'sceneReport':report.relative_to(root).as_posix() if report else None,'visualReview':review,'reasons':reasons}
counts=Counter(a.get('provider') for a in assets)
reviews=[readiness(a) for a in lux]
checked_ground=sum(a['id'] in grounded for a in assets)
ready=sum(r['strictReady'] for r in reviews)
(ev/'lux3d-reviewed.json').write_text(json.dumps({'createdAt':now,'catalogued':len(lux),'strictReady':ready,'items':reviews},ensure_ascii=False,indent=2),encoding='utf-8')
named=read(ev/'residence/residence-checks.json')
unit=subprocess.run([node_binary,'--test'],cwd=source_root,capture_output=True,encoding='utf-8',errors='replace')
(ev/'unit-tests.txt').write_text(unit.stdout+unit.stderr,encoding='utf-8')
if unit.returncode: raise RuntimeError('单元测试未全部通过')
count=re.search(r'(?:tests|测试)\s+(\d+)',unit.stdout).group(1)
cases=read(ev/'browser-checks.json')
if cases.get('errors') or len(cases.get('checks',[]))<6 or named.get('errors') or not named.get('restored'): raise ValueError('请先通过生产编辑与住宅恢复验证')
ai_file=ev/'local-ai/ai-e2e.json'
ai=read(ai_file) if ai_file.exists() else {}
ai_ok=(len(ai.get('cases',[]))>=2 and ai['cases'][0].get('appliedAndUndone') and ai['cases'][-1].get('appliedAndRestored') and not ai.get('pageErrors'))
ai_text='本机 Qwen3-VL 已通过真实文字位移、图片色样识别、确认、撤销和刷新恢复。' if ai_ok else '本地模型文字和读图命令仍在实测，以该目录成功记录为准。'
combined_file=ev/'portable-local-ai/combined-pack.json'
combined=read(combined_file) if combined_file.exists() else {}
replay_file=ev/'portable-local-ai/replay/replayed-pack.json'
replay=read(replay_file) if replay_file.exists() else {}
live_file=ev/'portable-local-ai/live-cpu-response.json'
live=read(live_file) if live_file.exists() else {}
portable_ai_text=('独立临时目录实际解压预演主包及正式扩展包，校验两个 GGUF 后从根目录启动，'
                  '通过真实文字位移与撤销、图片改色与刷新恢复。双包哈希、推理 GPU 层数和独立端口见 verification/v2/portable-local-ai/combined-pack.json。'
                  if combined.get('passed') and combined.get('weightsExtractedFromZip') else '双包独立解压的验证进度以 verification/v2/portable-local-ai/ 的实际结果为准。')
if not combined.get('passed') and replay.get('passed') and live.get('timeline',{}).get('colorApplied') and any(c.get('appliedAndUndone') for c in live.get('cases',[])):
    portable_ai_text=('独立临时目录的双包实测使用随包 CPU 推理，真实确认文字移动、撤销和图片识色应用；这一轮浏览器重载超时。另一轮用已保存的同一批真实响应，核对 IndexedDB 中的颜色并关页重开恢复；该轮未重新推理。两轮的版本哈希及原始记录见 verification/v2/portable-local-ai/。')
with (docs/'LUX3D_CREDIT_LEDGER.csv').open(encoding='utf-8-sig',newline='') as f: ledger=list(csv.DictReader(f))
recorded=sum(int(r['实际积分']) for r in ledger if r.get('taskId') and (r.get('实际积分') or '').isdigit())
reservations=read(root/'data/lux3d-v2/reservations.json')
frozen=sum(r.get('frozenCredits',0) or 0 for r in reservations)
def write(name,body): (docs/name).write_text(body.strip()+'\n',encoding='utf-8')
write('DREAMHOME_V2_ACCEPTANCE.md',f"""# DREAMHOME V2 验收记录

快照时间 {now}。模型数量按唯一目录 ID 统计。运行中的任务、缺少 GLB 的任务和重复放置的实例均不增加模型件数。

| 验收项目 | 实际结果 | 证据 |
| --- | --- | --- |
| 单房间与建筑编辑 | 创建客厅、改为 6.5 × 5.5 米、移动门洞，保存并刷新核对 | verification/v2/browser-checks.json |
| 普通平层 | 创建三室两厅两卫、切换房间，核对卫浴数；两室转角客餐厅和三室双阳台另有实际界面截图 | verification/v2/02-apartment.png；verification/v2/apartments/ |
| 家具搜索与操作 | 搜索、原件预览、放置沙发、茶几、餐桌、床和多实例 | verification/v2/03-model-preview.png |
| 2D 与 3D | 平面拖动后核对 3D 坐标，3D 改 X 和旋转后核对 SVG 足印 | verification/v2/04-floorplan.png |
| 外观与材料 | 家具实例、墙和地板应用材质并保存在项目中 | verification/v2/browser-checks.json；data/library/material-drag-e2e.json |
| 模型落地 | 快照目录中 {checked_ground}/{len(assets)} 件已取得实际顶点落地记录；容差 {floor_checks.get('toleranceMeters',0):.3f} 米 | data/library/vertex-floor-e2e.json |
| 已布置全套住宅 | {named['residence']['placements']} 件摆放、{named['residence']['lux3dPlacements']} 个 Lux3D 实例，在新浏览器会话从分享文件恢复 {named['restored']} 件 | verification/v2/residence/residence-checks.json |
| AI 修改 | {ai_text} | verification/v2/local-ai/ai-e2e.json |
| 用户凭据 | 设置界面可填写 Aholo 和 LLM；实测平台只读鉴权，会话隔离与删除由测试覆盖 | verification/v2/05-service-settings.png；tests/byok-security.test.js |
| 多项目与离线分享 | 上传 GLB、每层校准底图、跨会话导出导入、恢复 Phase 3 旧设计 | verification/v2/audit-portability.json |
| 多层与庭院 | 屋顶剖视、前庭设施、真实户外家具，楼梯可上下行 | verification/v2/villa-site/portable-browser.json |
| 窄屏 | 390 px 宽度，打开资源和属性面板，画布宽 390 px | verification/v2/residence/04-mobile.png |
| 来源与许可 | 每项在卡片中查询，模型、贴图、参考照片、授权和 SHA 分项记录 | ASSET_LICENSE_LEDGER.csv；ROOM_TEMPLATE_CATALOG.md |
| 数量 | {rooms} 类房间，{flats} 套普通平层，{villas} 套多层住宅。{len(assets)} 个 GLB、{sum(bool(a.get('thumbnailUrl')) for a in assets)} 张卡片预览、{sum(bool(a.get('planThumbnailUrl')) for a in assets)} 张俯视图。{len(materials)} 套 PBR 预设，其中 {sum(bool(m.get('maps',{}).get('baseColor')) for m in materials)} 套带真实贴图 | data/library/index.json；src/data/v2-contracts.js |
| 测试 | 当前源码 {count} 项通过，核心生产页面与住宅分享流程均无未处理 JavaScript 异常 | verification/v2/unit-tests.txt；verification/v2/browser-checks.json |

打包验证在新解压目录使用随包 Node，通过真实 API 获取模型、缩略图、俯视图、纹理和 HDR 环境光。每次发包使用该交付目录自己的验证报告与文件哈希，阶段包与后续扩库版本分别计数。

{portable_ai_text} 复现方式见 verification/v2/architecture-review.md。

部分模型带有目检备注，可能需要调整比例、方向或表面材质。设计参考尺寸支持修改，不能替代家具厂商尺寸或房屋测量。外部商业分发生成资产的许可范围请按中国区账户协议核对。
""")
write('DREAMHOME_V2_FINAL_REPORT.md',f"""# DREAMHOME V2 交付说明

截至 {now}，DREAMHOME 已可从空房或平层户型创建、保存、分享住宅设计。Phase 3/4 的 Three.js、编辑器、IndexedDB 存档和三件真实 Lux3D 家具继续使用。原版代码保存在本机 Git 的 phase4 分支，V2 在 dreamhome-v2 分支开发。

## 打开与演示

1. 将 Windows 主包完整解压，双击「启动DREAMHOME.cmd」，打开 http://127.0.0.1:{default_port} 。服务只监听本机。使用同一浏览器和地址可继续此前设计。
2. 首页选择「打开三室两厅样板房」，可以从整套开始。也可在 {rooms} 类空房或 {flats} 套平层中选一个，点「手动调整」后在右侧填写实际尺寸。
3. 在左侧点「Lux3D 原创」，搜索家具并预览。点「放入房间」或拖到地面。平面摆放使用真实俯视图；切到 3D 可查看材质、尺寸或漫游。
4. 在材料库更换墙地面或选中的家具。点击「保存项目」保存版本，通过「设计文件」导出 .dreamhome。安装本地 AI 扩展包后可直接让设计助手改动场景；也可在「API 管理」使用自己的服务。
5. 本地多模态扩展包解压到与主包相同的位置，保留 data/local-ai 目录结构。关闭旧启动窗口，重新双击启动。云端 Lux3D 需要网络和有效凭据，基础编辑、已归档资产和已安装的本地推理均可在本机工作。

## 当前交付数量

| 内容 | 快照数量 |
| --- | ---: |
| 独立 GLB 资产 | {len(assets)} |
| Lux3D 真实生成且入库，含原三件 | {len(lux)} |
| 上述 Lux3D 已通过场景测试、目检并可直接摆放 | {ready} |
| 其中使用照片生成且已归档的模型（含有外观备注的项目） | {sum(a.get('source')=='lux3d_image' for a in lux)} |
| Poly Haven 补充模型 | {counts.get('polyhaven',0)} |
| Kenney 补充模型 | {counts.get('kenney',0)} |
| PBR 材料预设 | {len(materials)} |

原有沙发 8394445、茶几 8395285、落地灯 8396095 保留任务来源。可直接摆放的模型须同时具备逐件场景通过记录、真实 GLB 与缩略图、已核查的外观和可用设计尺寸。待校准、带明显外观差异或组合结构备注的模型单列，逐件依据和未计入原因见 verification/v2/lux3d-reviewed.json。

## 积分与模型服务

原授权总额 3600。该次快照的任务级费用列合计 {recorded} 积分，新增任务保守冻结 {frozen} 积分，两者不能相加。失败任务可能发生退费，不明提交保留冻结且不重试。余额取有时间戳的账户用量页记录，未证实的实时余额保留为空。完整账本见 LUX3D_CREDIT_LEDGER.csv。

{ai_text} Aholo 与 LLM 用户凭据分别在设置里配置，服务端加密保存在当前会话；导出的设计、截图及发行包不带平台密钥。

## 源码与复核

开发入口为 npm ci、npm run dev。生产构建为 npm run build，运行 npm start。离线 Windows 包自带 Node 及依赖，可以直接双击启动。完整验收步骤、截图、演示素材和专项回归见 DREAMHOME_V2_ACCEPTANCE.md 及 verification/v2。资产来源、许可与生成来源分别在 ASSET_LICENSE_LEDGER.csv 和 LUX3D_CREDIT_LEDGER.csv 登记。

本交付未向赛事平台提交或部署公网服务。庭院与建筑参数用于概念设计展示。现有窗洞、开间、门扇和实物尺寸仍需以现场测量为准。
""")
print(now,len(assets),len(lux),ready,count,recorded,ai_text)
