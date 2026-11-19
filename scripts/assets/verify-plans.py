from pathlib import Path
from PIL import Image,ImageStat
import json,hashlib,sys
root=Path('data/library');source=Path(sys.argv[1]) if len(sys.argv)>1 else root/'index.json';output=Path(sys.argv[2]) if len(sys.argv)>2 else root/'plan-validation.json';data=source.read_bytes();d=json.loads(data);fail=[];results=[]
for a in d['assets']:
 try:
  for filename,key,info,square in [('plan.png','planThumbnailUrl','planThumbnail',False),('thumbnail.png','thumbnailUrl','thumbnail',True)]:
   if not a.get(key):raise ValueError(f'{key} 缺失')
   p=root/'models'/a['id']/filename;im=Image.open(p);im.load();meta=a.get(info,{})
   if hashlib.sha256(p.read_bytes()).hexdigest()!=meta.get('sha256'):raise ValueError(f'{filename} SHA 与快照不一致')
   if im.size!=(meta.get('width'),meta.get('height')) or (im.size!=(512,512) if square else max(im.size)!=512):raise ValueError(f'{filename} 尺寸错误 {im.size}')
   if not square:
    if im.mode not in ('RGBA','LA'):raise ValueError('俯视图无透明通道')
    alpha=im.getchannel('A');lo,hi=alpha.getextrema()
    if lo!=0 or hi==0 or not alpha.getbbox():raise ValueError('俯视图为空或无透明背景')
   else:
    extrema=im.convert('RGB').getextrema()
    if max(high-low for low,high in extrema)<8:raise ValueError('透视缩略图疑似空白')
  results.append({'id':a['id'],'status':'passed'})
 except Exception as e:
  fail.append({'id':a['id'],'error':str(e)});results.append({'id':a['id'],'status':'failed','error':str(e)})
report={'snapshot':str(source.resolve()),'snapshotSha256':hashlib.sha256(data).hexdigest(),'assets':len(d['assets']),'passed':len(results)-len(fail),'failures':fail,'results':results};output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('像素与哈希检查',len(results)-len(fail),'/',len(results),'fail',fail)
if fail:sys.exit(1)
