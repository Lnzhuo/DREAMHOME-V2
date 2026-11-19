# DREAMHOME V2

当前版本 **v2.1.1**。历次上线内容见 [GitHub Releases](https://github.com/Lnzhuo/DREAMHOME-V2/releases)。

DREAMHOME 是一个可编辑的 3D 家居设计工作室。可以从单个房间或整套户型开始，布置家具、调整门窗和材料，在平面、三维和漫游视图之间切换。项目支持导入 GLB，并可配置个人 Aholo/Lux3D 与兼容的 LLM 服务。

## 一句话搭配

首页的“精选风格搭配”提供林间中古客厅、暖陶假日卧室、胡桃晚餐餐厅和浅木书斋四套可编辑设计。点击封面会新建独立项目。已经打开项目时，点击左上角 DREAMHOME 可返回选择页。

在新建设计页描述客厅、卧室、书房或餐厅的用途、尺寸与偏好，点击“生成整套搭配”。配置好的 LLM 或 Windows 本地模型会补全设计参数，工作室再从模型库中摆放实际家具。打开方案后可以选中单件修改，也可以在 AI 助手中另建一套。没有连接模型时界面会标明使用本地规则。

在本机编辑器中选择“室内取景”，调整角度后点击“渲染效果图”，可将当前模型与材质交给 Blender Cycles 输出 1280 × 800 的 JPG。Windows 自动查找 Blender 安装目录，也可通过 `BLENDER_BIN` 指定可执行文件。示例使用 Blender 5.2。生成搭配需要配套的 `data/library`，使用本地 Qwen 还需要配套的 `data/local-ai`。

## 源码开发

使用 Node.js 24，在项目根目录运行 `npm ci`，然后运行 `npm run build`。使用 `npm run dev` 启动开发服务，地址以终端输出为准。

此仓库发布应用源码。完整演示使用独立的 `data/library/` 模型与材质库；源码仓库未附带该资产库、本地 AI 权重及用户凭据。接入外部服务的配置示例见 [.env.example](.env.example)，设置说明见 [BYOK 文档](docs/BYOK_SECURITY_SPEC.md)。

## 许可

项目原创代码采用 [MIT 许可证](LICENSE)。第三方软件、房间参考照片、模型及渲染画面遵循各自的许可。图片的作者、原始链接和许可记录见 [素材许可台账](docs/ASSET_LICENSE_LEDGER.csv)。
