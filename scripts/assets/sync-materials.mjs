import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const groups = {
  '木地板': 'wood_floor wood_floor_worn wooden_floor_01 wooden_floor_02 old_wooden_floor_01 old_wooden_floor_02 old_wooden_floor_03 dark_wooden_planks oak_wood_planks wood_planks',
  '木饰面': 'kitchen_wood lacquered_cherry_wood dark_wood dark_paneled_wood plywood rosewood_veneer1 rosewood_veneer_02 wood_table wood_table_001 wooden_panels',
  '瓷砖': 'anti_skid_tiles brown_floor_tiles floor_tiles_02 floor_tiles_04 floor_tiles_06 floor_tiles_08 interior_tiles long_white_tiles square_tiles_02 terracotta_floor_tiles terrazzo_tiles tiled_floor_001',
  '石材': 'marble_01 marble_mosaic_tiles granite_tile granite_tile_02 granite_tile_03 slab_tiles stone_tiles',
  '墙面': 'ceiling_interior grey_plaster plaster_grey_04 plastered_wall plastered_wall_04 white_plaster_02 white_plaster_rough_01 patterned_plaster_wall',
  '水泥': 'smooth_concrete_floor concrete_floor_01 concrete_floor_02 concrete_tiles_02 concrete_slab_wall painted_concrete',
  '皮革': 'brown_leather fabric_leather_01 fabric_leather_02 leather_red_02 leather_red_03 leather_white',
  '布艺': 'denim_fabric denim_fabric_03 denim_fabric_04 fabric_pattern_05 fabric_pattern_07 quatrefoil_jacquard_fabric',
  '金属': 'metal_plate_02 blue_metal_plate',
};
const catalog = await (await fetch('https://api.polyhaven.com/assets?t=textures')).json();
const items = Object.entries(groups).flatMap(([category, ids])=>ids.split(' ').map(id=>({id,category}))).filter(x=>catalog[x.id]);
const root=path.resolve('data/library'); const maps={baseColor:'Diffuse',normalMap:'nor_gl',roughnessMap:'Rough',aoMap:'AO',metalnessMap:'Metal'}; const results=[]; const failures=[];
async function one({id,category}) {
 const dir=path.join(root,'materials',id); await fs.mkdir(dir,{recursive:true});
 const files=await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
 const material={id,name:`${category} · ${catalog[id].name || id}`,category,baseColor:'#ffffff',roughness:1,metalness:category==='金属'?1:0,aoIntensity:1,repeat:[2,2],previewUrl:`/api/library/materials/${id}/Diffuse.jpg`,license:{name:'CC0',version:'1.0',url:'https://polyhaven.com/license',author:Object.keys(catalog[id].authors||{}).join(', ')||'Poly Haven',originalUrl:`https://polyhaven.com/a/${id}`,downloadedAt:new Date().toISOString(),modifyAllowed:true,attributionRequired:false},maps:{},createdAt:new Date().toISOString()};
 for(const [key,api] of Object.entries(maps)) {const url=files[api]?.['1k']?.jpg?.url;if(!url)continue;const filename=`${api}.jpg`,file=path.join(dir,filename);let b=await fs.readFile(file).catch(()=>null);if(!b){const res=await fetch(url);if(!res.ok)throw Error(`${id} ${api} ${res.status}`);b=Buffer.from(await res.arrayBuffer());await fs.writeFile(file,b);} material.maps[key]={url:`/api/library/materials/${id}/${filename}`,sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};}
 if(!material.maps.baseColor)throw Error(`${id} missing diffuse`);await fs.writeFile(path.join(dir,'material.json'),JSON.stringify(material,null,2)+'\n');return material;
}
let next=0; await Promise.all(Array.from({length:6},async()=>{while(next<items.length){const item=items[next++];try{const result=await one(item);results.push(result);console.log(results.length,item.id)}catch(e){failures.push({id:item.id,error:e.message});console.error(item.id,e.message)}}}));
results.sort((a,b)=>items.findIndex(x=>x.id===a.id)-items.findIndex(x=>x.id===b.id));const indexPath=path.join(root,'index.json');const index=JSON.parse(await fs.readFile(indexPath));index.materials=results;await fs.writeFile(indexPath,JSON.stringify(index,null,2)+'\n');await fs.writeFile(path.join(root,'material-sync.json'),JSON.stringify({count:results.length,failures},null,2)+'\n');console.log(JSON.stringify({count:results.length,failures}));
