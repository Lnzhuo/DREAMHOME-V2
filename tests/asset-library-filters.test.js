import test from 'node:test';import assert from 'node:assert/strict';import {requiresReview,filterCatalogAssets} from '../src/assets/catalog-filters.js';
const ok={id:'ok',name:'沙发',category:'客厅',provider:'aholo-lux3d',source:'lux3d_text',qa:{visualReview:'已目检',placementTest:'通过：场景回归'}};
const image={id:'photo',name:'图生餐椅',category:'餐厅',provider:'aholo-lux3d',source:'lux3d_image',qa:{visualReview:'已目检，座面存在外观差异',placementTest:'通过：场景回归'}};
const cc0={id:'cc0',name:'木椅',category:'餐厅',provider:'polyhaven',source:'licensed_library',qa:{visualReview:'已目检',placementTest:'通过：场景回归'}};
test('来源、分类、搜索与质量筛选独立组合，警示需明确选择',()=>{assert.equal(requiresReview(image),true);assert.deepEqual(filterCatalogAssets([cc0,image,ok]).map(x=>x.id),['ok','cc0']);assert.deepEqual(filterCatalogAssets([cc0,image,ok],{source:'image',quality:'all',category:'餐厅',query:'餐椅'}).map(x=>x.id),['photo']);assert.deepEqual(filterCatalogAssets([cc0,image,ok],{source:'lux3d',quality:'review'}).map(x=>x.id),['photo']);assert.deepEqual(filterCatalogAssets([cc0,image,ok],{source:'all',quality:'all'}).map(x=>x.id),['ok','cc0','photo']);});
test('尺寸或轴向异常不列为推荐，用户校准只解除尺寸警示',()=>{assert(requiresReview({...ok,scaleCalibrationRequired:true}));assert(!requiresReview({...ok,scaleCalibrationRequired:true,userCalibrated:true}));assert(requiresReview({...ok,userCalibrated:true,qa:{...ok.qa,axisReview:'异常待修复'}}));});
test('严格报告的缺陷词和待审核不能进入推荐',()=>{for(const word of ['不可拆','不可分','不能独立','需单独校准','额外支架','疑似重复','细节较浅','待人工检查'])assert.equal(requiresReview({qa:{visualReview:`已目检：${word}`,placementTest:'通过：回归'}}),true,word)});

test('没有 QA 记录的 Lux3D 模型不能视作已验收',()=>{assert(requiresReview({provider:'aholo-lux3d',source:'lux3d_image'}));});

test('缺少 QA 的外部库资产不冒充已验收',()=>{assert(requiresReview({source:'licensed_library',provider:'polyhaven'}));assert(!requiresReview({source:'user_upload'}));});

test('场景通过但未完成目检的模型不进入推荐',()=>{assert(requiresReview({provider:'aholo-lux3d',qa:{placementTest:'通过：回归'}}));assert(requiresReview({provider:'aholo-lux3d',qa:{placementTest:'通过：回归',visualReview:'未目检'}}));});
