import test from 'node:test';import assert from 'node:assert/strict';import {requiresReview,filterCatalogAssets} from '../src/assets/catalog-filters.js';
import {createLux3dRoomSample} from '../src/assets/generated/lux3d-room-samples.js';
const ok={id:'ok',name:'沙发',category:'客厅',provider:'aholo-lux3d',source:'lux3d_text',qa:{visualReview:'已目检',placementTest:'通过：场景回归'}};
const image={id:'photo',name:'图生餐椅',category:'餐厅',provider:'aholo-lux3d',source:'lux3d_image',qa:{visualReview:'已目检，座面存在外观差异',placementTest:'通过：场景回归'}};
const cc0={id:'cc0',name:'木椅',category:'餐厅',provider:'polyhaven',source:'licensed_library',qa:{visualReview:'已目检',placementTest:'通过：场景回归'}};
test('来源、分类、搜索与质量筛选独立组合，警示需明确选择',()=>{assert.equal(requiresReview(image),true);assert.deepEqual(filterCatalogAssets([cc0,image,ok]).map(x=>x.id),['ok','cc0']);assert.deepEqual(filterCatalogAssets([cc0,image,ok],{source:'image',quality:'all',category:'餐厅',query:'餐椅'}).map(x=>x.id),['photo']);assert.deepEqual(filterCatalogAssets([cc0,image,ok],{source:'lux3d',quality:'review'}).map(x=>x.id),['photo']);assert.deepEqual(filterCatalogAssets([cc0,image,ok],{source:'all',quality:'all'}).map(x=>x.id),['ok','cc0','photo']);});
test('尺寸或轴向异常不列为推荐，用户校准只解除尺寸警示',()=>{assert(requiresReview({...ok,scaleCalibrationRequired:true}));assert(!requiresReview({...ok,scaleCalibrationRequired:true,userCalibrated:true}));assert(requiresReview({...ok,userCalibrated:true,qa:{...ok.qa,axisReview:'异常待修复'}}));});
test('严格报告的缺陷词和待审核不能进入推荐',()=>{for(const word of ['不可拆','不可分','不能独立','需单独校准','额外支架','疑似重复','细节较浅','待人工检查'])assert.equal(requiresReview({qa:{visualReview:`已目检：${word}`,placementTest:'通过：回归'}}),true,word)});

test('没有 QA 记录的 Lux3D 模型不能视作已验收',()=>{assert(requiresReview({provider:'aholo-lux3d',source:'lux3d_image'}));});

test('缺少 QA 的外部库资产不冒充已验收',()=>{assert(requiresReview({source:'licensed_library',provider:'polyhaven'}));assert(!requiresReview({source:'user_upload'}));});

test('场景通过但未完成目检的模型不进入推荐',()=>{assert(requiresReview({provider:'aholo-lux3d',qa:{placementTest:'通过：回归'}}));assert(requiresReview({provider:'aholo-lux3d',qa:{placementTest:'通过：回归',visualReview:'未目检'}}));});
test('人工目检通过进入推荐，含缺陷及未经目检的临时通过仍待审',()=>{assert(!requiresReview({...ok,qa:{...ok.qa,visualReview:'已人工目检：餐椅外形、材质和方向正常'}}));assert(requiresReview({...ok,qa:{...ok.qa,visualReview:'已人工目检：侧面存在额外支架'}}));assert(requiresReview({...ok,qa:{...ok.qa,visualReview:'临时通过'}}));});
test('样板与目录共用目检判定',()=>{const asset={...ok,providerTaskId:'8394445',thumbnailUrl:'/thumbnail.png',qa:{...ok.qa,visualReview:'已人工目检：餐椅外形、材质和方向正常'}};assert(createLux3dRoomSample('lux-living',[asset]).document.placements.some(p=>p.assetId===asset.id));const flawed={...asset,qa:{...asset.qa,visualReview:'已人工目检：侧面存在额外支架'}};assert(!createLux3dRoomSample('lux-living',[flawed]).document.placements.some(p=>p.assetId===asset.id));});

test('实拍参考家具通过对照目检后可用于预设，带缺陷或未通过摆放测试时仍需复核', () => {
  const checked = { visualReview: '已对照目检：白瓷花瓶轮廓与参考接近', placementTest: '通过：真实载入、拾取、变换、保存重开' };
  assert.equal(requiresReview({ ...ok, qa: checked }), false);
  assert.equal(requiresReview({ ...ok, qa: { ...checked, visualReview: '已对照目检：轮廓差异' } }), true);
  assert.equal(requiresReview({ ...ok, qa: { ...checked, placementTest: '未测试' } }), true);
});
