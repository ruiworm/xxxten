# -*- coding: utf-8 -*-
"""下载随安装包分发的内置向量模型（构建期使用，不参与运行时）。

用法（仓库根目录）：
    python scripts/fetch-bundled-models.py [目标目录]

默认目标目录：backend/app/models/bundled_models/bge-small-zh-v1.5

背景：内置向量模型 bge-small-zh.v1.5 原由 fastembed 从 GCS / HuggingFace 现下，
国内网络两处都不可达，导致买家首次建索引必然失败。改为构建期随安装包分发，
买家安装后即可离线建索引。模型文件不进 git（见 .gitignore），只由 CI 下载。

镜像：设置 HF_ENDPOINT（如 https://hf-mirror.com）可切换下载源。
"""

from __future__ import annotations

import hashlib
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ID = "Qdrant/bge-small-zh-v1.5"
DEFAULT_TARGET = Path("backend/app/models/bundled_models/bge-small-zh-v1.5")

# 文件名、字节数、sha256 —— 三者必须全部匹配，防止拿到被替换的权重。
FILES: tuple[tuple[str, int, str], ...] = (
    (
        "config.json",
        739,
        "9088751d39abbf86ec3d19ffca92ad62ad19075f7e59712e6c71217fa125d1d3",
    ),
    (
        "ort_config.json",
        1234,
        "97e78d1d21c2eb719e865b018f17915df6a12ed987446eb7f3f3a783a5afb1e1",
    ),
    (
        "special_tokens_map.json",
        125,
        "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3",
    ),
    (
        "tokenizer.json",
        439125,
        "48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26",
    ),
    (
        "tokenizer_config.json",
        367,
        "e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a",
    ),
    (
        "vocab.txt",
        109540,
        "45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c",
    ),
    (
        "model_optimized.onnx",
        94781076,
        "1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38",
    ),
)

CHUNK_SIZE = 1024 * 1024
TIMEOUT_SECONDS = 120
RETRIES = 3


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_valid(path: Path, size: int, sha256: str) -> bool:
    if not path.is_file() or path.stat().st_size != size:
        return False
    return _sha256(path) == sha256


def _base_url() -> str:
    endpoint = (os.environ.get("HF_ENDPOINT") or "https://huggingface.co").strip()
    return endpoint.rstrip("/")


def _download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  下载 {dest.name} <- {url}")
    with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        total = int(response.headers.get("Content-Length", 0))
        written = 0
        with tmp.open("wb") as handle:
            while True:
                chunk = response.read(CHUNK_SIZE)
                if not chunk:
                    break
                handle.write(chunk)
                written += len(chunk)
        if total and written != total:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(f"下载不完整：{dest.name} 已写 {written}/{total} 字节")
    tmp.replace(dest)


def fetch_file(name: str, size: int, sha256: str, target: Path) -> None:
    dest = target / name
    if _is_valid(dest, size, sha256):
        print(f"  已就绪 {name}")
        return

    url = f"{_base_url()}/{REPO_ID}/resolve/main/{name}"
    last_error: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            _download(url, dest)
            if not _is_valid(dest, size, sha256):
                dest.unlink(missing_ok=True)
                raise RuntimeError(f"校验失败：{name} 与清单不一致")
            print(f"  完成 {name} ({size} 字节)")
            return
        except (urllib.error.URLError, OSError, RuntimeError) as exc:
            last_error = exc
            wait = 2 * attempt
            print(f"  第 {attempt} 次失败：{exc}，{wait}s 后重试", file=sys.stderr)
            time.sleep(wait)

    raise SystemExit(f"下载失败：{name}\n最后错误：{last_error}")


def main() -> None:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TARGET
    target.mkdir(parents=True, exist_ok=True)

    print(f"准备内置向量模型 {REPO_ID} -> {target}")
    for name, size, sha256 in FILES:
        fetch_file(name, size, sha256, target)

    total = sum(size for _, size, _ in FILES)
    print(f"内置向量模型已就绪：{len(FILES)} 个文件，共 {total / 1048576:.1f} MiB")


if __name__ == "__main__":
    main()
