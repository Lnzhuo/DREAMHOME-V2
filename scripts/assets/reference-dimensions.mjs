// Design references for preview placement, not measured manufacturer sizes.
const rules = [
 [/窗帘/,1,2.4], [/平板电视/,0,1.2],
 [/单人床1\.2/,0,1.2], [/双人床1\.5/,0,1.5], [/双人床1\.8/,0,1.8], [/双人床|储物床/,0,1.8], [/床头靠垫|抱枕|靠垫/,0,.45], [/高凳/,1,.75], [/长凳/,1,.45], [/床头柜/,1,.55], [/床尾凳|换鞋凳/,1,.45],
 [/单人.*沙发|单人.*椅|休闲椅|躺椅|餐椅|办公椅|转椅|网布.*椅/,1,.85], [/吧椅/,1,1.0], [/L形.*沙发|转角沙发|模块沙发/,0,2.6], [/沙发/,0,2.0], [/脚踏凳|脚凳|淋浴凳|梳妆凳/,1,.45],
 [/圆形四人餐桌/,1,.75], [/六人.*餐桌/,0,1.8], [/四人.*餐桌/,0,1.4], [/餐桌|书桌|桌/,1,.75], [/吧台|岛台/,1,.9], [/茶几|边几/,1,.45],
 [/独立冷冻柜/,1,.85], [/台式冰箱/,1,.6], [/冷冻柜|双开门冰箱|冰箱/,1,1.75], [/空调/,1,1.7], [/洗烘|洗衣机|烘干机|洗碗机/,1,.85], [/微波炉|烤箱|蒸箱/,0,.5], [/吸尘器|净化器|饮水机|电风扇|电热水器/,1,1.0], [/扫地机器人/,0,.35], [/咖啡机/,1,.35], [/电脑机箱/,1,.45], [/显示器/,0,.55], [/键盘/,0,.45],
 [/厨房高柜|浴室高柜|衣柜/,1,2.1], [/厨房.*吊柜|厨房.*吊架/,1,.7], [/厨房.*地柜|水槽柜/,1,.85], [/双盆.*浴室柜/,0,1.3], [/盆柜|浴室柜|洗手盆/,0,.8], [/浴缸/,0,1.7], [/淋浴隔断/,1,2.0], [/马桶/,1,.78], [/浴室镜|镜柜|穿衣镜/,1,1.5], [/花洒|龙头/,1,.8], [/毛巾架|卫生纸架|置物架/,0,.5],
 [/厨房拉篮柜/,1,.85], [/雨伞收纳架|阅读落地架/,1,.8], [/梳妆台/,1,.75], [/户外长椅/,1,.85],
 [/鞋柜|电视柜|餐边柜|斗柜|书柜|书架|文件柜|抽屉柜|展示柜|收纳柜|储物柜|边柜|酒柜/,1,1.2], [/收纳篮|收纳筐|脏衣篮|储物箱/,1,.45], [/挂钩/,0,.3], [/晾衣架/,1,1.6], [/花架/,1,1.0],
 [/落地阅读灯|落地灯/,1,1.55], [/台灯|夹灯/,1,.45], [/吊灯/,1,.55], [/长条.*吸顶灯/,0,1.0], [/吸顶灯|筒灯|射灯|壁灯/,0,.3], [/地毯/,0,1.8], [/门垫/,0,.75], [/盆栽/,1,.7], [/花瓶/,1,.3], [/装饰画/,1,.6], [/时钟/,0,.3], [/水槽|燃气灶|电磁灶/,0,.7], [/书立/,1,.3], [/推车/,1,.9]
];
const ranges = [[.02,4.5],[.02,3],[.02,4.5]];
export function referenceDimensions(name, category, bounds) {
 const values=bounds.max.map((v,i)=>v-bounds.min[i]);
 if(values.some(v=>!Number.isFinite(v)||v<=0)) return {error:'模型包围盒无效'};
 const rule=rules.find(([re])=>re.test(name));
 if(!rule)return {error:`${name} 暂无设计参考尺寸规则`,bounds};
 const [,axis,target]=rule,scale=target/values[axis],dims=values.map(v=>v*scale);
 const exceptions=dims.flatMap((v,i)=>v<ranges[i][0]||v>ranges[i][1]?[`${['宽','高','深'][i]} ${v.toFixed(3)}m 超出通用检查范围`]:[]);
 if(!/地毯|门垫/.test(name) && Math.max(...dims)/Math.min(...dims)>40)exceptions.push('长宽高比例异常，需单独核对');
 if(!/抱枕|靠垫/.test(name) && /沙发|椅|躺椅/.test(name) && (dims[1] < .35 || dims[1] > 1.5)) exceptions.push('座椅高度偏离设计参考范围');
 if(/床(?!头|尾)/.test(name) && (dims[2] < 1.8 || dims[2] > 2.8 || dims[1] > 1.8)) exceptions.push('床体深度或高度偏离设计参考范围');
 if(/吸顶灯/.test(name) && dims[1] > Math.max(dims[0],dims[2]) * .5) exceptions.push('吸顶灯可能竖立，需核对轴向');
 if(/地毯|门垫/.test(name) && dims[1] > .1) exceptions.push('地毯竖向高度异常，需核对轴向');
 if(/冰箱|洗衣机|烘干机/.test(name) && (dims[0] < .3 || dims[2] < .25 || dims[0] > 2.5 || dims[2] > 2.0)) exceptions.push('家电宽深偏离设计参考范围');
 const dim=i=>({value:Number(dims[i].toFixed(4)),unit:'m',source:'estimated'});
 return {dimensions:{width:dim(0),depth:dim(2),height:dim(1)},reference:{label:'设计参考尺寸，可调整，非厂家实测',source:'项目常见家具规格估算规则',anchorAxis:['width','height','depth'][axis],anchorMeters:target,rawBounds:bounds,rawSize:values,computedSize:{width:dims[0],height:dims[1],depth:dims[2]},exceptions},exceptions};
}
