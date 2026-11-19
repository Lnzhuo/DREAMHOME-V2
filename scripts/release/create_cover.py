from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

background_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
screenshot_path = Path(sys.argv[3])
output_path.parent.mkdir(parents=True, exist_ok=True)

background = Image.open(background_path).convert('RGB')
background = background.crop((0, 0, background.width, int(background.height * 0.94)))
canvas = background.resize((1600, 1000), Image.Resampling.LANCZOS)
overlay = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)
draw.rounded_rectangle((64, 64, 620, 936), radius=34, fill=(255, 253, 248, 235), outline=(184, 138, 85, 70), width=2)
draw.rounded_rectangle((660, 176, 1534, 804), radius=28, fill=(255, 255, 255, 245), outline=(184, 138, 85, 80), width=2)
canvas = Image.alpha_composite(canvas.convert('RGBA'), overlay)
draw = ImageDraw.Draw(canvas)

font_dir = Path('C:/Windows/Fonts')
def font(name, size):
    return ImageFont.truetype(str(font_dir / name), size)

accent = '#B88A55'
text = '#24231F'
muted = '#77746D'
draw.text((112, 116), 'DREAMHOME', font=font('msyhbd.ttc', 62), fill=text)
draw.text((116, 202), '造梦家', font=font('msyhbd.ttc', 38), fill=accent)
draw.text((116, 262), 'AI 3D Space Designer', font=font('msyh.ttc', 28), fill=muted)
draw.rounded_rectangle((114, 326, 174, 332), radius=3, fill=accent)
draw.text((116, 370), '从一个想法，到一个可以进入、', font=font('msyh.ttc', 24), fill=text)
draw.text((116, 410), '编辑和保存的 3D 空间。', font=font('msyh.ttc', 24), fill=text)

features = [('2D / 3D 联动', 510), ('真实 GLB 家具编辑', 570), ('项目与模型保存恢复', 630)]
for label, y in features:
    draw.ellipse((118, y + 10, 130, y + 22), fill=accent)
    draw.text((146, y), label, font=font('msyh.ttc', 23), fill=text)

draw.text((116, 770), 'Vanilla JS · Three.js · SceneDocument', font=font('msyh.ttc', 18), fill=muted)
draw.text((116, 806), 'TransformControls · IndexedDB', font=font('msyh.ttc', 18), fill=muted)
draw.text((116, 870), '真实运行版本 · 2026', font=font('msyh.ttc', 17), fill=accent)

screenshot = Image.open(screenshot_path).convert('RGB')
screenshot.thumbnail((830, 570), Image.Resampling.LANCZOS)
mask = Image.new('L', screenshot.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, screenshot.width, screenshot.height), radius=18, fill=255)
canvas.paste(screenshot, (682, 210), mask)
draw.text((684, 744), '真实产品运行画面', font=font('msyh.ttc', 20), fill=muted)
canvas.convert('RGB').save(output_path, optimize=True)
print(output_path)
