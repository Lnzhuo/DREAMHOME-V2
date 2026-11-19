"""Build DREAMHOME's original framed landscape print as a self-contained GLB."""
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
out = root / "public" / "assets" / "models"
out.mkdir(exist_ok=True)
rng = np.random.default_rng(411)
w, h = 1024, 720
paper = Image.new("RGB", (w, h), "#e7d9be")
d = ImageDraw.Draw(paper)
d.ellipse((576, 75, 766, 265), fill="#b6613e")
x = np.arange(w)
for base, amplitude, phase, col in [(345, 70, .5, "#bdaf91"), (411, 83, 2.8, "#7f896f"), (469, 72, 3.2, "#515f53"), (540, 72, .8, "#b78867"), (620, 90, 1.6, "#413e38")]:
    heights = base + amplitude*np.sin(x/w*5+phase) + 19*np.sin(x/w*11-phase)
    heights += np.interp(x, np.arange(0, w+16, 16), rng.normal(0, 2.4, len(np.arange(0, w+16, 16))))
    d.polygon([(int(i), int(y)) for i, y in enumerate(heights)]+[(w, h), (0, h)], fill=col)
grain = rng.normal(0, 4, (h, w, 1)) + rng.normal(0, 1.2, (h, 1, 1))
paper = Image.fromarray(np.clip(np.asarray(paper)+grain, 0, 255).astype("uint8"))
board = Image.new("RGB", (1164, 860), "#ece2cf")
board.paste(paper, (70, 70))
jpeg = io.BytesIO()
board.save(jpeg, format="JPEG", quality=88)
binary = bytearray()
views, accessors, primitives = [], [], []
def view(data):
    while len(binary)%4: binary.append(0)
    views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)})
    binary.extend(data)
    return len(views)-1
def acc(array, kind):
    a = np.array(array, dtype="<f4")
    accessors.append({"bufferView":view(a.tobytes()),"componentType":5126,"count":len(a),"type":kind,
                      "min":a.min(axis=0).tolist(),"max":a.max(axis=0).tolist()})
    return len(accessors)-1
def box(center, size, material):
    positions, normals, uv = [], [], []
    for axis, a, b in [(2,0,1),(0,1,2),(1,2,0)]:
        for sign in (-1,1):
            for u,v in [(0,0),(1,0),(1,1),(0,0),(1,1),(0,1)]:
                p=list(center); n=[0.,0.,0.]
                p[axis]+=sign*size[axis]/2
                p[a]+=(u-.5)*size[a]*sign
                p[b]+=(v-.5)*size[b]
                n[axis]=sign
                positions.append(p);normals.append(n);uv.append((u,1-v))
    primitives.append({"attributes":{"POSITION":acc(positions,"VEC3"),"NORMAL":acc(normals,"VEC3"),"TEXCOORD_0":acc(uv,"VEC2")},"material":material})
width, height, rim = 1.64, 1.21, .019
box((0,0,0),(width,height,.024),0)
for side in [-1,1]:
    box((side*(width-rim)/2,0,.017),(rim,height,.055),1)
    box((0,side*(height-rim)/2,.017),(width-rim*2,rim,.055),1)
def save_mesh(filename, materials, texture=None):
    doc={"asset":{"version":"2.0","generator":"DREAMHOME"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0}],
         "meshes":[{"primitives":primitives}],"materials":materials,
         "accessors":accessors,"bufferViews":views}
    if texture:
        doc.update(textures=[{"source":0}],images=[{"bufferView":view(texture),"mimeType":"image/jpeg"}])
    doc["buffers"]=[{"byteLength":len(binary)}]
    j=json.dumps(doc,separators=(",",":")).encode()
    j+=b" "*(-len(j)%4);binary.extend(bytes(-len(binary)%4))
    (out/filename).write_bytes(struct.pack("<4sII",b"glTF",2,28+len(j)+len(binary))+struct.pack("<I4s",len(j),b"JSON")+j+struct.pack("<I4s",len(binary),b"BIN\0")+binary)

def solid(r,g,b):
    return {"pbrMetallicRoughness":{"baseColorFactor":[r,g,b,1],"metallicFactor":0,"roughnessFactor":.83}}

save_mesh("studio-hills.glb",[{"pbrMetallicRoughness":{"baseColorTexture":{"index":0},"metallicFactor":0,"roughnessFactor":1}},
                          solid(.19,.105,.054)],jpeg.getvalue())

binary.clear(); views.clear(); accessors.clear(); primitives.clear()
for w,d,y,cover,x in [(.30,.23,0,1,0),(.265,.19,.033,2,.014)]:
    box((x,y+.016,0),(w-.004,.027,d-.005),0)
    for level in [.002,.031]:
        box((x,y+level,0),(w,.004,d),cover)
    box((x-w/2+.002,y+.016,0),(.005,.032,d),cover)
box((.078,.067,-.015),(.065,.0008,.08),0)
save_mesh("studio-books.glb",[solid(.77,.70,.54),solid(.12,.17,.14),solid(.46,.19,.10)])

# A short row of cloth-bound books for the 16 cm open shelves of the oak study.
binary.clear(); views.clear(); accessors.clear(); primitives.clear()
x=0
for i,(w,h,col) in enumerate([(.029,.132,0),(.034,.142,1),(.021,.117,2),(.039,.140,3),
                               (.025,.128,4),(.026,.13,4),(.033,.14,1),(.025,.126,2),(.029,.136,0)]):
    depth=.105+(i%3)*.006
    box((x+w/2,h/2,0),(w,h,depth),col)
    for y in [h*.76,h*.18]:
        box((x+w/2,y,depth/2+.0005),(w*.62,.002,.001),5)
    x+=w+.0015
save_mesh("studio-cloth-books.glb",[solid(.27,.35,.28),solid(.49,.34,.22),solid(.10,.15,.15),
                                    solid(.53,.25,.16),solid(.66,.60,.47),solid(.74,.64,.44)])
