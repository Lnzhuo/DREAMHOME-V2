"""Download and verify the optional local Windows inference runtime for the studio."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
from urllib.request import Request, urlopen
from zipfile import ZipFile
import os
import time

ROOT = Path(__file__).resolve().parents[2] / "data" / "local-ai"
MODEL = "Qwen/Qwen3-VL-4B-Instruct-GGUF"
MODEL_URL = "https://modelscope.cn/models/" + MODEL + "/resolve/master/"
RUNTIME = "llama-b12532-bin-win-vulkan-x64.zip"
FILES = [
    ("Qwen3VL-4B-Instruct-Q4_K_M.gguf", MODEL_URL, "66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a"),
    ("mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf", MODEL_URL, "30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d"),
    (RUNTIME, "https://github.com/ggml-org/llama.cpp/releases/download/b12532/", "adf70e4956e5277c1a8bfce17a9b59e098eac286a1e2b1cb8c76b72c908c20aa"),
]
def checksum(path):
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()

def download(item):
    name, base, expected = item
    path = ROOT / name
    if path.is_file() and checksum(path) == expected: return
    part = ROOT / (name + ".part")
    for attempt in range(3):
        try:
            start = part.stat().st_size if part.exists() else 0
            headers = {"User-Agent":"DREAMHOME-LocalAI/2.0"}
            if start: headers["Range"] = "bytes=%d-" % start
            with urlopen(Request(base + name, headers=headers), timeout=60) as response:
                mode = "ab" if start and response.status == 206 else "wb"
                with part.open(mode) as output:
                    for chunk in iter(lambda: response.read(1 << 20), b""): output.write(chunk)
            if checksum(part) != expected:
                part.unlink()
                raise ValueError("hash mismatch for " + name)
            part.replace(path)
            print("verified", name, flush=True)
            return
        except Exception:
            if attempt == 2: raise
            time.sleep(2)
if __name__ == "__main__":
    ROOT.mkdir(exist_ok=True, parents=True)
    with ThreadPoolExecutor(3) as pool: list(pool.map(download, FILES))
    target = ROOT / "runtime"
    with ZipFile(ROOT / RUNTIME) as archive:
        for info in archive.infolist():
            if info.is_dir(): continue
            # The official release may contain a single top-level version directory.
            name = Path(info.filename).name
            dest = target / name
            target.mkdir(exist_ok=True)
            with archive.open(info) as src, dest.open("wb") as out:
                for block in iter(lambda: src.read(1 << 20), b""): out.write(block)
    print(target / "llama-server.exe", flush=True)
