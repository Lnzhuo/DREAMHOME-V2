import csv,json,hashlib
from pathlib import Path
project=Path(__file__).resolve().parents[2];root=project/'data/library';d=json.loads((root/'index.json').read_text(encoding='utf-8'));rows=[]
for a in d['assets']:
 l=a.get('license',{});rows.append(['3D模型',a['id'],a['name'],a.get('provider',''),l.get('author','用户授权生成'),l.get('originalUrl','https://www.aholo.cn/hackathon' if a.get('provider')=='aholo-lux3d' else ''),l.get('name','Lux3D 中国区及比赛条款待核'),l.get('version',''),l.get('url',''),l.get('downloadedAt',a.get('createdAt','')),l.get('modifyAllowed','待核'),l.get('attributionRequired','待核'),a.get('archive',{}).get('sha256',''),a.get('archive',{}).get('originalSha256',''),'','','','个人赛事项目演示；公开分发待按套餐确认' if a.get('provider')=='aholo-lux3d' else '项目内模型与缩略图'])
 r=a.get('referenceSource')
 if isinstance(r,dict):
  rows.append(['图生参考照片',a['id']+'-reference',r.get('title','参考照片'),'Pexels',r.get('author',''),r.get('sourceUrl',''),r.get('license',''),'',r.get('licenseUrl',''),r.get('downloadDate',''),True,False,r.get('sha256',''),'',r.get('originalPath',''),r.get('inputPath',''),r.get('inputSha256',''),r.get('scope','')])
for m in d['materials']:
 l=m['license'];rows.append(['PBR材料',m['id'],m['name'],'自制参数预设' if m.get('source')=='procedural' else 'Poly Haven',l.get('author',''),l.get('originalUrl',''),l['name'],l.get('version',''),l.get('url',''),l.get('downloadedAt',''),l.get('modifyAllowed',''),l.get('attributionRequired',''),m.get('maps',{}).get('baseColor',{}).get('sha256',''),'','','','','项目内贴图'])
h=json.loads((root/'hdris/white_home_studio.json').read_text(encoding='utf-8'));rows.append(['HDRI',h['id'],h['name'],'Poly Haven',h['author'],h['sourceUrl'],'CC0','1.0',h['licenseUrl'],h['downloadedAt'],True,False,h['sha256'],'','','','','环境照明'])
references = [
 ('corner-windows.jpg','Empty apartment room with corner windows','aismallard','https://commons.wikimedia.org/wiki/File:Empty_apartment_room_with_corner_windows.jpg','CC BY-SA','3.0','https://creativecommons.org/licenses/by-sa/3.0/',True),
 ('kitchen-cc0.jpg','Empty apartment in Berlin with fitted kitchen, chair and plant','SmashingIt99','https://commons.wikimedia.org/wiki/File:Empty_apartment_in_Berlin_with_fitted_kitchen,_chair_and_plant.jpg','CC0','1.0','https://creativecommons.org/publicdomain/zero/1.0/',False),
 ('bathroom-by4.jpg','Contemporary bathroom','OKJaguar','https://commons.wikimedia.org/wiki/File:Contemporary_bathroom.jpg','CC BY','4.0','https://creativecommons.org/licenses/by/4.0/',True),
 ('apartment-kitchen.jpg','Riverside Plaza 2014-08-26 - apartment interior 3','August Schwerdfeger','https://commons.wikimedia.org/wiki/File:Riverside_Plaza_2014-08-26_-_apartment_interior_3.jpg','CC BY','4.0','https://creativecommons.org/licenses/by/4.0/',True),
 ('bedroom-by4.jpg','A Room in a shared apartment','0o0ogn','https://commons.wikimedia.org/wiki/File:A_Room_in_a_shared_apartment.jpg','CC BY','4.0','https://creativecommons.org/licenses/by/4.0/',True),
]
for filename,title,author,url,license,version,license_url,attribution in references:
 path=project/'public'/'room-references'/filename
 if not path.is_file(): raise FileNotFoundError(path)
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 rows.append(['房间参考照片',filename,title,'Wikimedia Commons',author,url,license,version,license_url,'2026-11-19',True,attribution,digest,'',f'public/room-references/{filename}','','',('备用历史参考图，未用于当前界面；原始文件未修改' if filename=='apartment-kitchen.jpg' else '原始文件未修改，页面以 CSS 裁切；仅作空间参考')])
extra_manifest=project/'scripts'/'assets'/'room-references-extra.json'
if extra_manifest.is_file():
 for ref in json.loads(extra_manifest.read_text(encoding='utf-8')):
  original=project/ref['originalPath'];preview=project/ref['previewPath']
  if not original.is_file() or not preview.is_file(): raise FileNotFoundError(f"房间参考图缺失：{original} 或 {preview}")
  original_hash=hashlib.sha256(original.read_bytes()).hexdigest();preview_hash=hashlib.sha256(preview.read_bytes()).hexdigest()
  if original_hash!=ref['originalSha256'] or preview_hash!=ref['previewSha256']: raise ValueError(f"房间参考图哈希不匹配：{ref['key']}")
  rows.append(['房间参考照片',f"pexels-{ref['photoId']}",ref['title'],'Pexels',ref['author'],ref['source'],ref['license'],'',ref['licenseUrl'],ref['downloadedAt'],True,False,original_hash,'',ref['originalPath'],ref['previewPath'],preview_hash,ref['usage']+'；'+ref['previewProcessing']])
showcase=project/'public'/'room-references'/'dreamhome-showcase.jpg'
if showcase.is_file():
 rows.append(['样板间实时渲染','dreamhome-showcase','DREAMHOME 客厅样板间','项目本地场景渲染','DREAMHOME','','源模型、材料及赛事条款适用','','','','待核','待核',hashlib.sha256(showcase.read_bytes()).hexdigest(),'','public/room-references/dreamhome-showcase.jpg','','','项目内样板间渲染；源模型受原许可约束'])
with open(project/'docs'/'ASSET_LICENSE_LEDGER.csv','w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f);w.writerow(['类型','ID','名称','来源','作者','原始网址','许可','版本','许可网址','下载时间','允许修改','要求署名','SHA256','原始GLB SHA256','本地原图','本地裁剪图','裁剪图SHA256','使用范围']);w.writerows(rows)
