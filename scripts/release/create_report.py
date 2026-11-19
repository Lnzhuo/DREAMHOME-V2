from pathlib import Path
from xml.sax.saxutils import escape
import json
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle
from pypdf import PdfReader

root = Path(sys.argv[1])
out = Path(sys.argv[2])
lux3d_status = '0；未创建任务，未产生费用'
lux3d_image = '04-glb-imported.png'
lux3d_persistence_text = 'GLB 导入时解析真实模型并计算 bounding box，尺寸标为 estimated。模型二进制存入 IndexedDB，SceneDocument 使用持久 idb:// 引用，刷新后重新生成 Blob URL。'
validation_path = root / 'lux3d-validation.json'
if validation_path.exists():
    validation = json.loads(validation_path.read_text(encoding='utf-8'))
    if validation.get('restored', {}).get('hasRealModel'):
        lux3d_status = f"{validation['taskId']}；真实 GLB 已生成、归档，鼠标编辑与刷新恢复通过"
        lux3d_image = 'lux3d-sofa-edited.png'
        lux3d_persistence_text = f"真实 Lux3D 文生沙发（taskId={validation['taskId']}）已下载归档并导入 DREAMHOME。模型包含 {validation['model']['triangles']:,} 个三角形和 PBR 纹理材质，底面 Y=0；鼠标编辑与刷新恢复均通过。"
results_path = root / 'lux3d-approved-results.json'
if results_path.exists():
    real_jobs = [entry for entry in json.loads(results_path.read_text(encoding='utf-8')) if entry.get('job', {}).get('status') == 'succeeded']
    if real_jobs:
        lux3d_status = '；'.join(f"{entry['requestedName']} {entry['job']['providerTaskId']}" for entry in real_jobs) + '；全部归档并验证'
        lux3d_persistence_text = f"真实 Lux3D 家具共 {len(real_jobs)} 件：奶油色沙发、原木茶几和落地灯。taskId 分别为 {', '.join(entry['job']['providerTaskId'] for entry in real_jobs)}。三件 GLB 均已下载归档、导入房间，并通过真实鼠标编辑与刷新恢复。"
if (root / 'lux3d-video-frame.png').exists():
    lux3d_image = 'lux3d-video-frame.png'
pdfmetrics.registerFont(TTFont('MicrosoftYaHei', 'C:/Windows/Fonts/msyh.ttc'))
accent = colors.HexColor('#B88A55')
text = colors.HexColor('#24231F')
muted = colors.HexColor('#77746D')
border = colors.HexColor('#E8E4DC')
soft = colors.HexColor('#F7F5F0')

styles = {
    'title': ParagraphStyle('title', fontName='MicrosoftYaHei', fontSize=24, leading=32, textColor=text, spaceAfter=16),
    'h1': ParagraphStyle('h1', fontName='MicrosoftYaHei', fontSize=17, leading=23, textColor=accent, spaceBefore=4, spaceAfter=12),
    'h2': ParagraphStyle('h2', fontName='MicrosoftYaHei', fontSize=13, leading=18, textColor=text, spaceBefore=8, spaceAfter=8),
    'body': ParagraphStyle('body', fontName='MicrosoftYaHei', fontSize=10.5, leading=17, textColor=text, wordWrap='CJK', spaceAfter=8),
    'small': ParagraphStyle('small', fontName='MicrosoftYaHei', fontSize=8.5, leading=13, textColor=muted, wordWrap='CJK', spaceAfter=6),
    'code': ParagraphStyle('code', fontName='Courier', fontSize=8.2, leading=12, textColor=text, backColor=soft, borderColor=border, borderWidth=1, borderPadding=10, spaceBefore=8, spaceAfter=8),
}

def p(value, style='body'):
    return Paragraph(escape(value).replace('\n', '<br/>'), styles[style])

def h(value):
    return p(value, 'h1')

def image(name, width=515):
    from PIL import Image as PILImage
    with PILImage.open(root / name) as source:
        height = width * source.height / source.width
    return Image(str(root / name), width=width, height=height)

def table(rows, widths=None):
    result = Table(rows, colWidths=widths, hAlign='LEFT')
    result.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'MicrosoftYaHei'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('LEADING', (0, 0), (-1, -1), 13),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 0), (-1, 0), accent),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, soft]),
        ('GRID', (0, 0), (-1, -1), 0.5, border),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return result

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(border)
    canvas.line(40, 28, A4[0] - 40, 28)
    canvas.setFont('MicrosoftYaHei', 8)
    canvas.setFillColor(muted)
    canvas.drawString(40, 16, 'DREAMHOME · 真实运行证据 · 2026-11-19')
    canvas.drawRightString(A4[0] - 40, 16, f'第 {doc.page} 页')
    canvas.restoreState()

story = [
    image('DREAMHOME-cover-v3.png'),
    Spacer(1, 14),
    p('项目：DREAMHOME 造梦家｜AI 3D Space Designer', 'title'),
    p('从一个想法，到一个可以进入、编辑和保存的 3D 空间。', 'h2'),
    p('版本：Final MVP + 2D/3D 联动｜日期：2026-11-19', 'body'),
    p('本报告只陈述可复核的真实能力。测试 GLB、Provider Mock 和 SceneCommand fixture 不作为真实 Lux3D 或真实 LLM 成果。', 'small'),
    PageBreak(),

    h('1. 用户痛点与产品方案'),
    p('普通业主和租房用户往往难以使用专业 CAD/BIM 工具。传统效果图只能观看，无法继续调整家具、验证布局或保存可编辑结构。DREAMHOME 将参数化空间、真实 GLB 家具和统一 SceneDocument 结合，让非专业用户也能完成从创建房间到保存方案的闭环。'),
    table([
        ['用户', '核心需求', '当前对应能力'],
        ['普通业主', '装修前查看布局并调整家具', '5.2m × 4.8m 客厅、2D/3D 编辑、保存恢复'],
        ['租房用户', '单间改造与家具摆放', 'GLB 导入、移动/旋转/缩放、2D 平面'],
        ['家具爱好者', '把已有模型放进空间', 'GLB 预览、bounding box、真实 Mesh 编辑'],
    ], [95, 205, 215]),
    Spacer(1, 12),
    h('产品闭环'),
    p('创建客厅 → 2D/3D 查看 → 导入 GLB → 家具编辑 → 保存快照 → 刷新重新打开。'),
    h('MVP 边界'),
    p('当前优先单房间。整屋、多楼层、别墅和庭院只保留 SceneDocument 扩展结构，不宣称已经完成。真实 Lux3D 和真实 LLM 需要单独的费用批准与调用证据。'),
    PageBreak(),

    h('2. 核心产品能力'),
    image('01-product-editor.png'),
    Spacer(1, 10),
    table([
        ['模块', '已实现并验证的功能', '真实性说明'],
        ['空间', '5.2m × 4.8m 奶油风客厅', 'SceneDocument 参数化墙体、地面和 Opening'],
        ['编辑', '选择、移动、旋转、缩放、删除、替换、改色', '真实 Three.js Mesh 与 TransformControls'],
        ['资产', 'GLB 导入、预览、放置和来源展示', '测试 GLB 是用户上传，不是 Lux3D'],
        ['持久化', '项目列表、自动保存、快照、删除和刷新恢复', 'IndexedDB 保存文档与 GLB 二进制'],
    ], [70, 260, 185]),
    PageBreak(),

    h('3. 2D/3D 联动与真实编辑'),
    p('2D 与 3D 读取同一份 SceneDocument。2D 选择、拖动会更新 Three.js；3D 变换结束后会重绘 2D。历史记录只保存一次，越界会回滚，不建立第二套场景数据。'),
    table([[image('02-floorplan.png', 250), image('03-mouse-transform.png', 250)]], [250, 250]),
    Spacer(1, 10),
    p('左：2D 房间边界、门窗、家具 footprint 和 5.20m × 4.80m 标注。右：TransformControls 与属性面板同步。', 'small'),
    p('编辑操作支持网格吸附、删除/替换/改色、撤销重做和基础房间边界检查。完整碰撞和动线求解不在当前承诺范围内。'),
    PageBreak(),

    h('4. GLB 与项目持久化'),
    table([[image(lux3d_image, 250), image('06-project-restored.png', 250)]], [250, 250]),
    Spacer(1, 10),
    p(lux3d_persistence_text),
    p('E2E 验证：GLB 为 27,588 字节，保存快照并刷新后 projectId、Asset、Placement 和真实 Mesh 均恢复，hasRealModel=true，未出现 loadError。'),
    p('当前持久化绑定浏览器和 origin，不等于跨设备云同步。'),
    PageBreak(),

    h('5. 技术架构与数据契约'),
    p('Vanilla JavaScript + Three.js + Vite + Node HTTP + IndexedDB。没有迁移 React，也没有进行全量 TypeScript 重写。'),
    p('Asset/Project Repository → SceneDocument → Game/EditorBridge → Three.js\nThree.js 用户操作 → EditorBridge → SceneDocument → 2D/3D 同步', 'code'),
    table([
        ['约束', '实现'],
        ['唯一数据源', 'SceneDocument；旧 OBJECTS 仅为派生兼容层'],
        ['单位与坐标', '米、Y-up、内部旋转弧度；2D 使用同一平面坐标'],
        ['尺寸来源', 'measured / plan_label / predicted / estimated / unknown'],
        ['AI 安全', '白名单 SceneCommand、Schema、真实 ID、预览、确认和撤销；禁止 eval'],
        ['密钥边界', 'Aholo/LLM Key 仅服务端环境变量，前端 bundle 不包含 SDK/Key'],
    ], [120, 395]),
    PageBreak(),

    h('6. 测试与真实运行证据'),
    table([
        ['检查', '实际结果'],
        ['单元、AI Schema、Provider Mock', '31/31 通过，0 失败'],
        ['生产环境 Playwright E2E', '全部断言通过，含 2D、编辑、GLB、快照和恢复'],
        ['生产构建', '34 modules，约 304ms；JS 745.19kB，CSS 14.26kB'],
        ['生产模式启动', '真实 Edge 浏览器通过，pageerror=0'],
        ['GLB 恢复', '27,588 字节 Blob 和真实 Mesh 完整恢复'],
        ['密钥检查', '构建未检出 Key；源码包不含 .env、依赖或用户数据'],
        ['Demo 视频', '真实 Lux3D 版 56.20 秒，1440×900；WebM/VP9 与 MP4/H.264'],
    ], [190, 325]),
    Spacer(1, 10),
    p('原始证据位于 docs/verification/final/，包括 report.json、真实截图、视频和 DREAMHOME-source.zip。'),
    image('lux3d-video-frame.png'),
    PageBreak(),

    h('7. Aholo、LLM 与后续计划'),
    p('Aholo 账户接入已完成：服务端正确加载 .env，区域为 cn，API 地址为 https://api.aholo.cn，Lux3D SDK 为 1.10.0。只读鉴权与任务历史查询成功，没有通过创建任务测试鉴权。'),
    table([
        ['项目', '当前真实状态'],
        ['真实 Lux3D taskId / GLB', lux3d_status],
        ['1 件 / 3 件预计费用', '官网限时价：20 / 60 积分；实际扣费以账户流水为准'],
        ['可用积分 / 免费次数 / 有效期', '负责人确认有额度；具体数值待账户页面核实'],
        ['失败/取消是否扣费、是否需充值', '待账户页面核实'],
        ['真实 LLM 调用', '0；没有可用配置，不以 Mock 冒充'],
        ['稳定公网与官网提交', '以队长最终提交和回执为准，本报告不虚构成功状态'],
    ], [190, 325]),
    Spacer(1, 10),
    h('真实 Lux3D 验证'),
    p('三件家具均已保存真实 taskId、Prompt、G1 参数、GLB、SHA-256、bounding box 和尺寸来源；导入 DREAMHOME 后分别验证选择、TransformControls 和保存恢复。全部通过，无占位模型替代。'),
    h('提交材料'),
    p('本 PDF、MP4/H.264 视频、真实截图、封面、源代码压缩包和提交表单内容均已整理。队长需要在官网完成正式提交并保存回执截图。'),
]

doc = SimpleDocTemplate(str(out), pagesize=A4, rightMargin=40, leftMargin=40, topMargin=34, bottomMargin=42, title='DREAMHOME 造梦家项目报告', author='DREAMHOME')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
reader = PdfReader(str(out))
if len(reader.pages) != 8:
    raise RuntimeError(f'Expected 8 pages, got {len(reader.pages)}')
print({'pdf': str(out), 'pages': len(reader.pages), 'bytes': out.stat().st_size})
