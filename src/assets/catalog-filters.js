export function requiresReview(asset) {
  if ((asset.provider === 'aholo-lux3d' || asset.source === 'licensed_library') && !asset.qa) return true;
  if (asset.qa && !asset.qa.visualReview) return true;
  if (asset.qa && !/已人工目检|已目检|已检查/.test(asset.qa.visualReview || '')) return true;
  if (asset.scaleCalibrationRequired && !asset.userCalibrated) return true;
  if (asset.qa?.axisReview === '异常待修复') return true;
  if (/待|需复核|瑕疵|异常|差异|不可拆|不可分|不能独立|需单独校准|额外支架|疑似重复|细节较浅|未目检|未人工|未审核|未复核|未验收/.test(asset.qa?.visualReview || '')) return true;
  if (asset.qa && !asset.qa.placementTest?.startsWith('通过')) return true;
  return false;
}
export function filterCatalogAssets(assets, { source = 'all', quality = 'recommended', category = '', query = '' } = {}) {
  const term = query.trim().toLowerCase();
  return assets.filter(asset => {
    const review = requiresReview(asset);
    if (source === 'lux3d' && asset.provider !== 'aholo-lux3d') return false;
    if (source === 'image' && asset.source !== 'lux3d_image') return false;
    if (quality === 'recommended' && review) return false;
    if (quality === 'review' && !review) return false;
    if (category && asset.category !== category) return false;
    return !term || `${asset.name} ${asset.category} ${(asset.tags || []).join(' ')}`.toLowerCase().includes(term);
  }).sort((a,b) => Number(requiresReview(a)) - Number(requiresReview(b)) || Number(b.provider === 'aholo-lux3d') - Number(a.provider === 'aholo-lux3d') || a.name.localeCompare(b.name, 'zh-CN', {numeric:true}));
}
