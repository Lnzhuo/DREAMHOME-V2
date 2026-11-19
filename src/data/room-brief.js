export const SPACES = { living_room:'客厅', master_bedroom:'卧室', study:'书房', dining_room:'餐厅' };
export const PALETTES = {
  linen: { name:'燕麦与浅橡木', wall:'#ece2ce', timber:'#ac8560', floor:'oak_wood_planks' },
  moss: { name:'鼠尾草与胡桃木', wall:'#a6ad94', timber:'#79543a', floor:'wooden_floor_02' },
  clay: { name:'陶土与暖白', wall:'#c79378', timber:'#916348', floor:'oak_wood_planks' },
  walnut: { name:'胡桃木与烟灰', wall:'#a69b8b', timber:'#634634', floor:'dark_wooden_planks' },
};
export const DETAILS = ['reading','storage','plants','rug','art','tv','work'];
export function validBrief(b) {
  return b && Object.hasOwn(SPACES,b.space) && Object.hasOwn(PALETTES,b.palette)
    && ['width','depth'].every(k=>Number.isFinite(b[k]) && b[k]>=3.2 && b[k]<=9)
    && Array.isArray(b.details) && b.details.every(k=>DETAILS.includes(k))
    && typeof b.note==='string' && b.note.length<=300;
}

export function localBrief(text) {
  if (/卫生间|卫浴|厨房|浴室|阳台|别墅|全屋|整套住宅/.test(text)) throw new Error('本地单间搭配支持客厅、卧室、书房和餐厅。');
  const space = /卧室|睡房|卧房/.test(text) ? 'master_bedroom' : /餐厅|用餐/.test(text) ? 'dining_room'
    : /书房|工作室/.test(text) ? 'study' : 'living_room';
  const palette = /绿|森林|苔藓/.test(text) ? 'moss' : /陶土|橘|红棕|赤陶/.test(text) ? 'clay'
    : /深色|中古|胡桃|深木/.test(text) ? 'walnut' : 'linen';
  const details = [];
  const wishes = { plants:'绿植|植物|盆栽', rug:'地毯', art:'挂画|装饰画', reading:'看书|读书|阅读', work:'办公|电脑|工作区', storage:'储物|收纳', tv:'电视' };
  for (const [key, words] of Object.entries(wishes)) {
    if (new RegExp('(?:不要|不用|不放|不想要|不需要|去掉|不摆|无)(?:任何|放|摆放|摆)?(?:'+words+')').test(text)) continue;
    if (['plants','rug','art'].includes(key) || new RegExp(words).test(text)) details.push(key);
  }
  const dims = text.match(/(\d+(?:\.\d+)?)\s*(?:米|m)?\s*[×xX*乘]\s*(\d+(?:\.\d+)?)/);
  const area = text.match(/(\d+(?:\.\d+)?)\s*(?:平方米|平米|平方|平|㎡)/);
  const width = dims ? Number(dims[1]) : area ? Math.sqrt(Number(area[1])*1.2) : 5.8;
  const depth = dims ? Number(dims[2]) : area ? Number(area[1])/width : 4.8;
  const brief={space,palette,width:Math.round(width*100)/100,depth:Math.round(depth*100)/100,details,note:''};
  if (!validBrief(brief)) throw new Error('当前单间搭配支持每边 3.2 至 9 米，请调整尺寸。');
  return brief;
}
