# 家具与材料资源库

目录位于 `data/library/`，由服务端 `/api/library/index.json` 提供；模型、缩略图和贴图均从 `/api/library/` 读取，不依赖外部临时链接。目录按资产定义与摆放实例分离，模型与贴图的 SHA-256、来源和许可见 `ASSET_LICENSE_LEDGER.csv`。注意仓库目前将 `data/` 排除在 Git 外，打包与部署时必须另行纳入完整目录。

目录包含 Poly Haven、Kenney 与 Lux3D GLB，每件配实际渲染的 512×512 PNG；数量随批次更新，以 index.json 和质量记录为准。目录另有 69 种室内材料（63 种 CC0 贴图材料及 6 种自制墙漆/玻璃参数预设）。床类包括古典床、旧式床架和日式榻床，不代表已覆盖现代双人床的全部尺寸；六件不适合普通住宅室内的资源已退出产品目录，原文件仍保留。Kenney 家电、卫浴模型为低多边形风格，与写实模型分开标识；新 Lux3D 模型的中国区及比赛条款尚待核验。资源库数量不等同于所有模型均已通过场景编辑与保存恢复验收。

- `models/<id>/model.glb`：嵌入纹理的模型；`thumbnail.png`：离线从该模型渲染；`asset.json`：来源、估算尺寸、哈希与检查状态。
- `materials/<id>/`：Diffuse（sRGB）、OpenGL Normal、Roughness、AO 及可用 Metal 贴图。未提供的贴图不伪造；repeat、粗糙度和金属度存在材料定义中。分类使用中文，搜索支持名称、类别和原始 ID。
- `hdris/white_home_studio_2k.hdr`：Poly Haven 的 White Home Studio，CC0 1.0，2K Radiance HDR；环境光 URL `/api/library/hdris/white_home_studio_2k.hdr`。建议使用 Three.js RGBELoader 和 PMREM，保持背景独立。
- `scripts/assets/render-thumbnails.mjs`：自动启动本机专用离线服务并打开本机 Chrome 与 WebGL 渲染；正常浏览不触发批量生成。`validate-catalog.mjs` 逐件检查 GLB 解析、网格、包围盒、缩略图分辨率及贴图哈希。

模型尺寸是基于包围盒的估算，不是制造商尺寸。`steel-frame-shelves-01` 原始约 21 米，展示尺寸按 0.1 比例估计，需人工复核；放置时按展示尺寸缩放并由场景对齐底面。缩略图总览见 `data/library/contact-1.jpg` 至 `contact-7.jpg`。真实场景的选择、移动、旋转、缩放、保存重开结果见 data/library/placement-e2e.json 与 lux-qa/ 下各批报告；材质拖放与重复贴图分别见 material-drag-e2e.json 和 material-repeat-e2e.json。每件 Lux3D 的核验状态见 verification/v2/lux3d-reviewed.json。原 Lux3D 模型来源及权利条款需按账户协议核实，不应标为 CC0。

材料栏可调整基色、粗糙度、金属度和纹理重复率，带相应贴图的预设还可调法线或环境遮蔽强度。将参数应用到选中家具、墙面或地板时，项目单独保存这个材质版本；恢复预设不改变已摆放的实例。

材料接口：`getPBRMaterial(definition)`；资产浏览器 `new AssetLibrary({root, assetRepository, onPlace, onJobChange})`；材料浏览器 `new MaterialLibrary({root, onApply, onApplyToRoom})`。家具拖放传递 `text/plain` 资产 ID；材料拖放使用 `application/x-dreamhome-material`。场景端负责目标拾取、实际应用、项目持久化及撤销。

批量增量处理由 `node scripts/assets/watch-lux3d.mjs` 执行：依据 `reservations.json` 的 archived 状态发现新模型，归档 GLB、渲染缩略图、运行场景回归并写 `data/library/new-lux3d-progress.json`。目检状态独立登记，待目检不得记为视觉验收通过。无真实尺寸时，按照品种参考主轴和实际包围盒等比计算，仅为可调设计估算，原始包围盒、选取主轴和异常记录在 `designReference`；异常或无规则时须单独校准。

每件已完成离线生成的 `plan.png` 是透明正交顶视图，最长边 512 像素，图像上方为世界局部 -Z、右方为 +X，宽高比按模型实际 X/Z 包围盒缩放。`planThumbnailUrl` 是 2D 编辑器读取入口；`planThumbnail` 记录尺寸、哈希与方向。批量重建使用 `node scripts/assets/render-plans.mjs`，核验使用 `python scripts/assets/verify-plans.py`。新资产自动增量生成；旧项目缺少该字段时应按 asset ID 查当前目录。
