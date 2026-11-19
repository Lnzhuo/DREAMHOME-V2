# DREAMHOME V2 验收记录

快照时间 2026-11-19 22:53 中国标准时间。模型数量按唯一目录 ID 统计。运行中的任务、缺少 GLB 的任务和重复放置的实例均不增加模型件数。

| 验收项目 | 实际结果 | 证据 |
| --- | --- | --- |
| 单房间与建筑编辑 | 创建客厅、改为 6.5 × 5.5 米、移动门洞，保存并刷新核对 | verification/v2/browser-checks.json |
| 普通平层 | 创建三室两厅两卫、切换房间，核对卫浴数；两室转角客餐厅和三室双阳台另有实际界面截图 | verification/v2/02-apartment.png；verification/v2/apartments/ |
| 家具搜索与操作 | 搜索、原件预览、放置沙发、茶几、餐桌、床和多实例 | verification/v2/03-model-preview.png |
| 2D 与 3D | 平面拖动后核对 3D 坐标，3D 改 X 和旋转后核对 SVG 足印 | verification/v2/04-floorplan.png |
| 外观与材料 | 家具实例、墙和地板应用材质并保存在项目中 | verification/v2/browser-checks.json；data/library/material-drag-e2e.json |
| 模型落地 | 快照目录中 254/254 件已取得实际顶点落地记录；容差 0.015 米 | data/library/vertex-floor-e2e.json |
| 已布置全套住宅 | 34 件摆放、16 个 Lux3D 实例，在新浏览器会话从分享文件恢复 34 件 | verification/v2/residence/residence-checks.json |
| 大场景的本机 AI | 四个房间共 120 个摆放实例，真实本机 CPU 推理移动第 120 件沙发，并按图片给另一房间的茶几改色；需要覆盖全屋的操作返回澄清。 | verification/v2/residence/large-home-ai.json |
| 整套住宅的本机 AI | 在 34 件家具的整套住宅中，选中茶几右移 10 厘米，逐件比对其余 33 件，撤销后恢复原坐标。 | verification/v2/residence/apartment-ai.json |
| AI 修改 | 本机 Qwen3-VL 已通过真实文字位移、图片色样识别、确认、撤销和刷新恢复。 | verification/v2/local-ai/ai-e2e.json |
| 用户凭据 | 设置界面可填写 Aholo 和 LLM；实测平台只读鉴权，会话隔离与删除由测试覆盖 | verification/v2/05-service-settings.png；tests/byok-security.test.js |
| 多项目与离线分享 | 上传 GLB、每层校准底图、跨会话导出导入、恢复 Phase 3 旧设计 | verification/v2/audit-portability.json |
| 多层与庭院 | 屋顶剖视、前庭设施、真实户外家具，楼梯可上下行 | verification/v2/villa-site/portable-browser.json |
| 窄屏 | 390 px 宽度，打开资源和属性面板，画布宽 390 px | verification/v2/residence/04-mobile.png |
| 来源与许可 | 每项在卡片中查询，模型、贴图、参考照片、授权和 SHA 分项记录 | ASSET_LICENSE_LEDGER.csv；ROOM_TEMPLATE_CATALOG.md |
| 数量 | 13 类房间，10 套普通平层，2 套多层住宅。254 个 GLB、254 张卡片预览、254 张俯视图。69 套 PBR 预设，其中 63 套带真实贴图 | data/library/index.json；src/data/v2-contracts.js |
| 测试 | 当前源码 84 项通过，核心生产页面与住宅分享流程均无未处理 JavaScript 异常 | verification/v2/unit-tests.txt；verification/v2/browser-checks.json |

打包验证在新解压目录使用随包 Node，通过真实 API 获取模型、缩略图、俯视图、纹理和 HDR 环境光。每次发包使用该交付目录自己的验证报告与文件哈希，阶段包与后续扩库版本分别计数。

在独立临时目录解压经过核验的 Windows 主包和本地多模态扩展包，校验两个 GGUF 后从根目录启动，通过真实文字位移与撤销、图片改色与刷新恢复。双包哈希、推理 GPU 层数和独立端口见 verification/v2/portable-local-ai/combined-pack.json。 复现方式见 verification/v2/architecture-review.md。

部分模型带有目检备注，可能需要调整比例、方向或表面材质。设计参考尺寸支持修改，不能替代家具厂商尺寸或房屋测量。外部商业分发生成资产的许可范围请按中国区账户协议核对。
