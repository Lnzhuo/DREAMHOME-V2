"""Cut and narrate the studio's real production browser capture and verified screenshots."""
import argparse
import json
import subprocess
import tempfile
import wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[2]
ev=root/'docs/verification/v2'
cli=argparse.ArgumentParser()
cli.add_argument('--ffmpeg',required=True)
cli.add_argument('--output',type=Path,required=True)
args=cli.parse_args()
core=json.loads((ev/'browser-checks.json').read_text(encoding='utf-8'))['shots']
home=json.loads((ev/'residence/residence-checks.json').read_text(encoding='utf-8'))['timeline']
ai=json.loads((ev/'local-ai/ai-e2e.json').read_text(encoding='utf-8')).get('timeline',{})
has_ai_video=bool(ai.get('colorApplied')) and (ev/'local-ai/assistant.webm').is_file()
clips=[
('DREAMHOME V2','从空房到整套住宅','选一个房间，或直接打开一套布置好的家。每件家具都能独立编辑。','01-start.png',0),
('房间与户型','输入实际尺寸，调整门窗','选客厅，调长宽和门窗。保存再打开，尺寸会保留。','DREAMHOME-V2-demo.webm',max(1,core.get('01-room-dimensions',4)-1)),
('原创家具库','用 Lux3D 原创家具布置房间','这张沙发由 Lux3D 生成。搜索、旋转预览，再放进客厅。','DREAMHOME-V2-demo.webm',max(0,core['03-model-preview']-2)),
('实物照片生成家具','参考照片与可旋转模型并排对照','这把椅子由实物照片生成。左右对照细节，座面颜色有差异，可以再改。','image-to-3d/01-photo-model.png',0),
('平面与三维','同一件家具，同一组坐标','在平面图拖动家具，再切到三维查看。三维里调整的位置和角度，同样会反映到平面图。','DREAMHOME-V2-demo.webm',max(0,core['04-floorplan']-3)),
('设计整套住宅','晴木之家 · 三室两厅两卫','这套三室两厅样板房有三十四件家具。选择房间，就能单独布置。','residence/residence.webm',max(0,home['01-home']-1)),
('平面布置','查看共墙、门窗和家具俯视图','从平面图看房间通路。每件家具的俯视图都由它自己的三维模型生成。','residence/residence.webm',max(0,home['02-plan']-1)),
('材质与漫游','换墙地材料，走进房间','走进卫生间，核对淋浴房和台盆的间距，再回到编辑器调整。','residence/residence.webm',max(0,home['03-bathroom']-1)),
('设计助手','先看方案，再应用或撤销','请助手把茶几向右移二十厘米。确认后应用，还可以撤销。','local-ai/assistant.webm' if has_ai_video else 'local-ai/01-ai-plan.png',max(ai.get('movePreview',0)-1,0)),
('参考图改色','本机视觉模型识别材料色样','上传蓝色色样。本机视觉模型识别颜色，确认后只修改选中的沙发。','local-ai/assistant.webm' if has_ai_video else 'local-ai/02-ai-image-applied.png',max(ai.get('colorPreview',0)-1,0)),
('扩展空间','分层编辑住宅和庭院','多层住宅还可以调整楼梯、前庭和屋顶。户外桌椅和盆栽也能像室内家具一样单独移动。','villa-site/villa-garden-overview.png',0),
('项目与分享','本机保存，可携带设计文件','可以填写自己的模型服务密钥。导出设计文件，换一台电脑继续布置。','05-service-settings.png',0),
]
posters={
  '房间与户型':'01-room-dimensions.png', '原创家具库':'03-model-preview.png', '平面与三维':'04-floorplan.png',
  '设计整套住宅':'residence/01-home.png','平面布置':'residence/02-plan.png','材质与漫游':'residence/03-bathroom.png',
  '设计助手':'local-ai/01-ai-plan.png','参考图改色':'local-ai/02-ai-image-applied.png',
}
for _,_,_,source,_ in clips:
    if not (ev/source).is_file(): raise ValueError('缺少实际画面 '+source)
args.output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='dreamhome-demo-') as d:
    tmp=Path(d)
    plan=tmp/'speech.json'
    plan.write_text(json.dumps([{'narration':row[2]} for row in clips],ensure_ascii=False),encoding='utf-8')
    subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'scripts/release/narrate-demo.ps1'),'-JsonFile',str(plan),'-Destination',d],check=True)
    font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',27)
    small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',20)
    for i,(label,caption,narration,source,offset) in enumerate(clips):
        with wave.open(str(tmp/f'audio-{i}.wav')) as f: duration=f.getnframes()/f.getframerate()+.55
        # Keep the entire UI visible above the caption rail on a 16:9 canvas.
        layer=Image.new('RGBA',(1600,900),(0,0,0,0))
        draw=ImageDraw.Draw(layer)
        draw.rectangle((0,826,1600,900),fill='#21372e')
        draw.text((73,843),label,font=font,fill='#f4e3c7',stroke_width=0)
        draw.text((335,846),caption,font=font,fill='#f6f5f0')
        draw.text((1313,851),'DREAMHOME  /  V2',font=small,fill='#c2d2c6')
        layer.save(tmp/f'caption-{i}.png')
        path=ev/source
        inp=['-ss',str(offset),'-i',str(path)] if path.suffix=='.webm' else ['-loop','1','-framerate','25','-i',str(path)]
        extra=[]
        screen='[0:v]fps=25,scale=1322:826,pad=1600:900:139:0:color=0xf5f2eb,tpad=stop_mode=clone:stop_duration=20[screen];'
        if path.suffix=='.webm' and label in posters:
            action=min(3.0,duration*.45)
            poster=ev/posters[label]
            if not poster.is_file(): raise ValueError('缺少操作结果截图 '+str(poster))
            extra=['-loop','1','-framerate','25','-i',str(poster)]
            # The real recording shows the action. Hold its verified result while the narration finishes.
            screen=('[0:v]fps=25,scale=1322:826,setsar=1,tpad=stop_mode=clone:stop_duration=3,trim=duration='+str(action)+',setpts=PTS-STARTPTS[a];'
                    '[3:v]fps=25,scale=1322:826,setsar=1,trim=duration='+str(duration-action)+',setpts=PTS-STARTPTS[b];'
                    '[a][b]concat=n=2:v=1:a=0,pad=1600:900:139:0:color=0xf5f2eb[screen];')
        cmd=[args.ffmpeg,'-hide_banner','-loglevel','error','-y',*inp,'-i',str(tmp/f'caption-{i}.png'),'-i',str(tmp/f'audio-{i}.wav'),*extra,
             '-filter_complex',screen+'[screen][1:v]overlay=0:0[v]',
             '-map','[v]','-map','2:a:0','-af','loudnorm=I=-18:TP=-2:LRA=9,apad','-t',f'{duration:.3f}','-c:v','libx264','-threads','4','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',
             '-c:a','aac','-ar','48000','-ac','2','-b:a','144k',str(tmp/f'part-{i}.mp4')]
        subprocess.run(cmd,check=True)
    playlist=tmp/'files.txt'
    playlist.write_text(''.join(f"file 'part-{i}.mp4'\n" for i in range(len(clips))),encoding='ascii')
    subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','1','-i',str(playlist),'-c','copy','-movflags','+faststart',str(args.output.resolve())],check=True)
print(args.output,args.output.stat().st_size)
