"""Build a relocatable optional AI pack for the Windows studio."""
import argparse
import hashlib
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED

project = Path(__file__).resolve().parents[2]
model = project / "data/local-ai"
parser = argparse.ArgumentParser()
parser.add_argument("output",type=Path)
args = parser.parse_args()
weights = {
    "Qwen3VL-4B-Instruct-Q4_K_M.gguf": "66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a",
    "mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf": "30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d",
}
files = [model / name for name in weights]
for file in files:
    with file.open("rb") as stream:
        if hashlib.file_digest(stream,"sha256").hexdigest() != weights[file.name]:
            raise ValueError("模型文件校验失败 " + file.name)
files.extend([model / "runtime/llama-server.exe", *sorted((model/"runtime").glob("*.dll")),
              *sorted((model/"runtime").glob("LICENSE*")), *sorted((model/"licenses").glob("*"))])
args.output.parent.mkdir(parents=True,exist_ok=True)
temp=args.output.with_suffix(".partial.zip")
with ZipFile(temp,"w",compression=ZIP_STORED,allowZip64=True) as archive:
    for file in files:
        archive.write(file,file.relative_to(project).as_posix(),compress_type=ZIP_STORED if file.suffix==".gguf" else ZIP_DEFLATED)
    archive.writestr("本地AI安装说明.txt","将本压缩包解压到 DREAMHOME 主程序的根目录，使两个包中的 data 目录合并。随后双击启动DREAMHOME.cmd。模型和视觉编码器在本机运行；首次模型载入需要一些时间。已启动应用应先关闭对应启动窗口再重新启动。\r\n".encode("utf-8-sig"))
temp.replace(args.output)
print(args.output, args.output.stat().st_size)
