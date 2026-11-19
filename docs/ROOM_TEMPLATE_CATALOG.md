# 房间与平层户型目录

房间模板数据在 `src/data/v2-contracts.js`。现有 13 类：客厅、主卧、次卧、餐厅、厨房、卫生间、书房、玄关、走廊、阳台、衣帽间、储物间和洗衣房。单房间支持矩形、长条形、L 型、飘窗轮廓及开放式轮廓；面积、尺寸均为用户可修改的估算值。

十套平层中，走廊布局模板包括两室一厅一卫、两室两厅一卫、三室一厅一卫、三室两厅两卫、四室两厅两卫、紧凑小户型、横厅、南北通透。模板用示意性平面几何表示，墙体在交点处分段，共墙仅保存一次；这组模板的各房间通过共墙门洞连接中间走廊。转角客餐厅和双阳台采用独立的相邻关系，见下文。外窗设置在外墙。实际住宅的净面积、墙体承重、门窗和通风应由用户按真实户型核实。

向导返回 SceneDocument。`RoomEditor` 可修改房间长宽、层高、门窗位置和尺寸，各房间均可切换轮廓；改变平层房间尺寸会移动相邻墙体及其后续坐标，整套面积按净面积之和等比例调整。家具尺寸不随建筑缩放。2D 图显示整层，点击房间切换当前房间。

限制：轮廓中的飘窗仅是示意性凹凸边界，不是可独立编辑的完整飘窗构造。开放式空间在实际墙段开敞口，可修改开口宽高，也可在其他墙段添加门、窗和敞开通道。模板示意不能代表工程施工图；在「调整相邻关系」选择目标房间和东、西、南、北方位，可移动当前房间，家具随房间平移；与其他房间重叠或断开通道时会提示。房间参考图片是通用空间参考，并非模板对应实景。尺寸和面积变化时家具位置随房间移动，家具自身尺寸保持不变；若家具轮廓超出新房间，编辑会拒绝并提示。

## 空间参考图片来源

- `public/room-references/corner-windows.jpg`：aismallard，《Empty apartment room with corner windows》，[原始页面](https://commons.wikimedia.org/wiki/File:Empty_apartment_room_with_corner_windows.jpg)，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)，2026-11-19 下载；允许修改、商用，须署名并遵守相同方式共享。界面以 CSS 裁切，原始文件未修改。仅作通用空房参考，不代表模板对应实景。
- `public/room-references/apartment-kitchen.jpg`：August Schwerdfeger，《Riverside Plaza 2014-08-26 - apartment interior 3》，[原始页面](https://commons.wikimedia.org/wiki/File:Riverside_Plaza_2014-08-26_-_apartment_interior_3.jpg)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，2026-11-19 下载；允许修改、商用，须署名并说明修改；文件未修改。该图尚未放入向导界面。

房间可选五种轮廓，可选择边缘房间新增相邻空间或阳台，重建共墙并为邻接房间设置门洞；删除房间会同时移除该房间的家具。新增空间按四个方向寻找空位；已有房间可从属性面板重新指定邻接方向。改变形状或增删房间会重建墙段，尽可能按原位置保留门窗。请在变更后核对各房间的门窗和实际通路。

- `kitchen-cc0.jpg`：SmashingIt99，[柏林公寓厨房](https://commons.wikimedia.org/wiki/File:Empty_apartment_in_Berlin_with_fitted_kitchen,_chair_and_plant.jpg)，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，2026-11-19 下载，允许修改、再分发和商用；原图未修改，界面裁切。
- `bathroom-by4.jpg`：OKJaguar，[Contemporary bathroom](https://commons.wikimedia.org/wiki/File:Contemporary_bathroom.jpg)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，2026-11-19 下载，允许修改、商用，须署名并说明修改；原图未修改，界面裁切。
- `bedroom-by4.jpg`：0o0ogn，[A Room in a shared apartment](https://commons.wikimedia.org/wiki/File:A_Room_in_a_shared_apartment.jpg)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，2026-11-19 下载，允许修改、商用，须署名并说明修改；原图未修改，界面裁切。

普通房间 13 类使用 12 张实景照片：主卧与次卧共享卧室照片，其余房型分别配图。照片均为空间参考，并非各模板的精确实景或尺寸依据。新增八张 Pexels 照片的作者、逐图来源页、许可、原图与预览 SHA-256、缩放处理及用途见 `scripts/assets/room-references-extra.json`。原图归档于 `assets/source/room-references/`，界面使用压缩预览 `public/room-references/`；预览将原图按比例缩至最长边 1280 像素并 JPEG 编码，卡片显示时按比例裁切。Pexels License 允许免费下载、修改及用于商业项目，但禁止单独销售或暗示被摄主体背书，也不得原样重新分发至素材平台；具体以 [Pexels 许可原文](https://www.pexels.com/license/) 为准。

天花板按房间启用，漫游时显示；墙厚作用于当前房间边界及共墙，踢脚线按全层启用。门扇以打开方向作示意，用户仍需检查实际开启空间。修改导致门窗相互重叠、超出墙体，或家具超出新轮廓时会提示并回滚。

## 多层住宅扩展

两层和三层庭院住宅是程序化示意模板。楼层各自记录 `levelIndex`、`elevation`、房间与墙体；楼梯记录 `x`、`z`、宽度、进深和台阶数，上一层记录对应楼板洞口。庭院边界保存于 `outdoorZones`，前庭进深可修改。各层几何独立分组；可以通过选择房间切换楼层，保存后恢复这些数据。

楼梯支持上下行，墙、窗、庭院围栏和泳池边缘会阻挡漫游。分层楼板和天花有实际洞口。走廊、楼梯和坡屋顶用于空间演示，未做工程结构校核。为保持楼梯和洞口对齐，多层模板暂不支持平面面积缩放、改变楼梯走廊轮廓或删除该走廊；相应操作会提示。其他独立楼层的建筑编辑与家具校验仍需结合实际户型核对。


## 新增两套平层示意

- 两室转角客餐厅：主卧、次卧分别连接玄关；客厅和餐厅呈转角组合，通过开放通道相连，卫生间与厨房分别连接过厅和餐厅，玄关设户门。主卧与次卧各约 4 × 3 米，客厅约 4 × 6 米，餐厅及厨房约 3 × 3 米。
- 三室双阳台：三个约 3.5 × 3.5 米的卧室连接横向过道；生活阳台连接客厅，卧室阳台连接次卧；客餐厅开放连通，厨房从餐厅进入，过道端部设户门。厨房约 3 × 2 米，实际可用净宽应按墙厚和设备重新校核。

上述两套为程序化自设计示意，非测绘或施工图，尺寸以房间轮廓计算，门窗、朝向及墙体承重均应按实际房屋核实。合计十套平层模板。
