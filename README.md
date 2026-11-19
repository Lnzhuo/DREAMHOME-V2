# DREAMHOME V2

DREAMHOME 是一个可编辑的 3D 家居设计工作室。可以从单个房间或整套户型开始，布置家具、调整门窗和材料，在平面、三维和漫游视图之间切换。项目支持导入 GLB，并可配置个人 Aholo/Lux3D 与兼容的 LLM 服务。

## 源码开发

使用 Node.js 24，在项目根目录运行 `npm ci`，然后运行 `npm run build`。使用 `npm run dev` 启动开发服务，地址以终端输出为准。

此仓库发布应用源码。完整演示使用独立的 `data/library/` 模型与材质库；源码仓库未附带该资产库、本地 AI 权重及用户凭据。接入外部服务的配置示例见 [.env.example](.env.example)，设置说明见 [BYOK 文档](docs/BYOK_SECURITY_SPEC.md)。

## 许可

项目原创代码采用 [MIT 许可证](LICENSE)。第三方软件、房间参考照片、模型及渲染画面遵循各自的许可。图片的作者、原始链接和许可记录见 [素材许可台账](docs/ASSET_LICENSE_LEDGER.csv)。
