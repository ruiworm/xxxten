# -*- coding: utf-8 -*-
"""
FastEmbed Embeddings - 将 fastembed 本地模型包装为 LangChain Embeddings 接口。

fastembed 的推理是同步的，这里通过 asyncio.to_thread 将同步调用移出事件循环，
避免阻塞请求处理。

模型获取策略（按优先级）：
1. 随安装包内置的模型目录（``app/models/bundled_models/<模型名>``，可由环境变量
   ``OPENFIC_BUNDLED_MODELS_DIR`` 指向安装目录下的副本），命中时直接以
   ``specific_model_path`` 加载，完全不联网。这是国内网络下的主路径。
2. GCS (Google Cloud Storage) 直链下载（上游已陆续撤下，仅部分旧模型仍有）。
3. HuggingFace 下载（国内通常不可达，保留为最后兜底）。
后两条路径失败会进入冷却窗口，避免每次检索都重试导致长时间卡顿。
"""

from __future__ import annotations

import asyncio
import os
import shutil
import tarfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from langchain_core.embeddings import Embeddings
from loguru import logger

from app.settings import BACKEND_DATA_DIR

_FASTEMBED_CACHE_DIR = BACKEND_DATA_DIR / "fastembed_cache"
_DOWNLOAD_TIMEOUT_SECONDS = 120

# 随安装包分发的内置模型：键为 fastembed 的 model_name，值为内置目录名。
# 新增内置模型时把文件放进 app/models/bundled_models/<目录名>/ 并在此登记。
# 环境变量 OPENFIC_BUNDLED_MODELS_DIR 可覆盖根目录（桌面端传入安装目录下的副本）。
_BUNDLED_MODELS_ENV = "OPENFIC_BUNDLED_MODELS_DIR"
_BUNDLED_MODEL_FOLDERS: dict[str, str] = {
    "BAAI/bge-small-zh-v1.5": "bge-small-zh-v1.5",
}
_BUNDLED_MODELS_ROOT = Path(__file__).resolve().parents[1] / "bundled_models"

# 下载失败冷却窗口（秒）。无 GCS 源的模型（内置重排模型即属此类）只能走
# HuggingFace；网络不可达时若不冷却，每次检索都会重新预检 + 重试，
# 单次耗时可达十几秒。冷却期内直接快速失败，由调用方立即降级。
_DOWNLOAD_FAILURE_COOLDOWN_SECONDS = 300

# 失败状态表：source_key -> (失败时刻 monotonic, 错误摘要)。
# source_key 形如 "gcs:<model>" / "hf:<model>"，两个来源互不阻塞。
_download_failures: dict[str, tuple[float, str]] = {}
_download_failure_guard = threading.Lock()

# 进程级模型实例缓存。fastembed 构造 onnx 会话开销大（数百毫秒到数秒），
# 缓存后同一模型的后续检索直接复用实例。
_model_instances: dict[tuple[str, str], Any] = {}
_model_locks: dict[tuple[str, str], threading.Lock] = {}
_model_cache_guard = threading.Lock()


def _download_failure_message(source_key: str) -> str | None:
    """返回冷却期内的失败提示；不在冷却期时返回 None 并清理记录。"""
    with _download_failure_guard:
        entry = _download_failures.get(source_key)
    if entry is None:
        return None
    elapsed = time.monotonic() - entry[0]
    if elapsed >= _DOWNLOAD_FAILURE_COOLDOWN_SECONDS:
        with _download_failure_guard:
            _download_failures.pop(source_key, None)
        return None
    remaining = max(1, int(_DOWNLOAD_FAILURE_COOLDOWN_SECONDS - elapsed))
    return (
        f"{entry[1]}\n"
        f"模型下载失败冷却中（约 {remaining} 秒后可重试），期间检索会自动降级。"
    )


def _record_download_failure(source_key: str, message: str) -> None:
    with _download_failure_guard:
        _download_failures[source_key] = (time.monotonic(), message)


def _clear_download_failure(source_key: str) -> None:
    with _download_failure_guard:
        _download_failures.pop(source_key, None)


def _resolve_cache_dir() -> Path:
    cache_dir = _FASTEMBED_CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _is_complete_model_dir(path: Path) -> bool:
    """判断目录是否是一份可离线加载的 ONNX 模型（权重 + 分词器配置齐全）。"""
    try:
        if not path.is_dir():
            return False
        names = {item.name for item in path.iterdir() if item.is_file()}
    except OSError:
        return False
    return (
        any(name.endswith(".onnx") for name in names)
        and "config.json" in names
        and "tokenizer.json" in names
    )


def _bundled_model_dir(model_name: str) -> Path | None:
    """定位随安装包内置的模型目录；未内置或不完整时返回 None。

    优先读环境变量 ``OPENFIC_BUNDLED_MODELS_DIR``（桌面端会指向 resources 下的副本），
    其次读轮子内的 ``app/models/bundled_models/<目录名>``。
    """
    folder = _BUNDLED_MODEL_FOLDERS.get(model_name)
    if folder is None:
        return None

    candidates: list[Path] = []
    override = (os.environ.get(_BUNDLED_MODELS_ENV) or "").strip()
    if override:
        candidates.append(Path(override) / folder)
    candidates.append(_BUNDLED_MODELS_ROOT / folder)

    for candidate in candidates:
        if _is_complete_model_dir(candidate):
            return candidate
    return None


def _build_opener() -> urllib.request.OpenerDirector:
    """构建支持系统代理的 URL opener。

    urllib.request.urlopen 默认不读取 HTTP_PROXY/HTTPS_PROXY 环境变量，
    需显式通过 ProxyHandler 注入代理，使代理网络环境下也能正常下载模型。
    """
    proxies = urllib.request.getproxies()
    if proxies:
        return urllib.request.build_opener(urllib.request.ProxyHandler(proxies))
    return urllib.request.build_opener()


def _download_with_timeout(url: str, dest: Path, *, timeout_seconds: int) -> None:
    """从 URL 下载文件到 dest，带连接和读取超时。

    自动使用系统代理（HTTP_PROXY/HTTPS_PROXY 环境变量）。
    网络不可达时在超时内失败并抛出清晰错误，而非无限挂起。
    每 10 MiB 记录一次进度日志。
    """
    import socket

    opener = _build_opener()
    try:
        with opener.open(url, timeout=timeout_seconds) as response:  # noqa: S310
            total = int(response.headers.get("Content-Length", 0))
            written = 0
            last_report = 0
            chunk = 64 * 1024
            report_interval = 10 * 1024 * 1024  # 10 MiB
            with open(dest, "wb") as f:
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    written += len(chunk)
                    if total > 0 and written - last_report >= report_interval:
                        logger.info(
                            "模型下载进度: {:.0%} ({:.1f} / {:.1f} MiB)",
                            written / total,
                            written / 1048576,
                            total / 1048576,
                        )
                        last_report = written
            if total > 0 and written != total:
                raise IOError(f"模型下载不完整: 已写 {written} 字节, 预期 {total} 字节")
    except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            f"内置模型下载失败（网络不可达或超时）: {url}\n"
            f"错误: {exc}\n"
            "请检查网络连接或代理设置后重试，或手动下载模型放到 "
            f"{_FASTEMBED_CACHE_DIR} 目录。"
        ) from exc


def _list_supported_models(model_class: Any, model_name: str) -> dict[str, Any] | None:
    list_supported_models = getattr(model_class, "list_supported_models", None)
    if not callable(list_supported_models):
        return None
    for spec in list_supported_models():
        if spec["model"] == model_name:
            return spec
    return None


def _ensure_model_from_gcs(
    model_class: Any,
    model_name: str,
    cache_dir: Path,
) -> bool:
    """若模型有 GCS 源且尚未缓存，则从 GCS 下载并解压。

    返回 True 表示模型已就绪且可以 HF_HUB_OFFLINE 方式加载（即无需访问 HF）。
    """
    spec = _list_supported_models(model_class, model_name)
    if spec is None:
        return False

    sources = spec.get("sources", {})
    gcs_url = sources.get("url")
    if not gcs_url:
        return False

    deprecated_tar = sources.get("_deprecated_tar_struct", False)
    fast_name = f"{'fast-' if deprecated_tar else ''}{model_name.split('/')[-1]}"
    model_dir = cache_dir / fast_name
    source_key = f"gcs:{model_name}"

    if model_dir.exists() and any(model_dir.iterdir()):
        _clear_download_failure(source_key)
        return True

    cached_failure = _download_failure_message(source_key)
    if cached_failure is not None:
        raise RuntimeError(cached_failure)

    tar_gz_path = cache_dir / f"{fast_name}.tar.gz"
    tmp_dir = cache_dir / "tmp" / fast_name

    try:
        logger.info("从 GCS 下载 fastembed 模型: {} -> {}", model_name, gcs_url)
        _download_with_timeout(gcs_url, tar_gz_path, timeout_seconds=120)

        if tmp_dir.exists():
            shutil.rmtree(tmp_dir)
        tmp_dir.mkdir(parents=True, exist_ok=True)
        with tarfile.open(str(tar_gz_path), "r:gz") as tar:
            tar.extractall(str(tmp_dir))  # noqa: S202

        tar_gz_path.unlink(missing_ok=True)
        extracted = tmp_dir / fast_name
        if extracted.exists():
            extracted.rename(model_dir)
        else:
            for child in tmp_dir.iterdir():
                child.rename(model_dir)
                break
        shutil.rmtree(tmp_dir.parent, ignore_errors=True)
    except Exception as exc:
        _record_download_failure(
            source_key, f"内置模型下载失败（GCS）: {model_name}\n错误: {exc}"
        )
        raise

    logger.info("fastembed 模型已缓存: {} -> {}", model_name, model_dir)
    _clear_download_failure(source_key)
    return True


def _set_hf_offline(enabled: bool) -> str | None:
    """临时切换 HuggingFace 离线模式（env var + huggingface_hub 常量）。

    huggingface_hub 在导入时缓存 HF_HUB_OFFLINE，仅设 env var 不够，
    需同时修改常量。返回原值供恢复。
    """
    import huggingface_hub.constants as hf_constants

    old_env = os.environ.get("HF_HUB_OFFLINE")
    old_const = hf_constants.HF_HUB_OFFLINE

    os.environ["HF_HUB_OFFLINE"] = "1" if enabled else "0"
    hf_constants.HF_HUB_OFFLINE = enabled

    return f"{old_env}|{old_const}"


def _restore_hf_offline(state: str | None) -> None:
    if state is None:
        return
    old_env, old_const = state.split("|")
    import huggingface_hub.constants as hf_constants

    if old_env == "None":
        os.environ.pop("HF_HUB_OFFLINE", None)
    else:
        os.environ["HF_HUB_OFFLINE"] = old_env
    hf_constants.HF_HUB_OFFLINE = old_const == "True"


_HF_URL = "https://huggingface.co"
_PREFLIGHT_TIMEOUT = 5.0


def _check_hf_reachable() -> None:
    """HTTPS 预检 HuggingFace 是否可达，不可达时快速失败。"""
    try:
        with urllib.request.urlopen(
            urllib.request.Request(f"{_HF_URL}/api/status", method="HEAD"),
            timeout=_PREFLIGHT_TIMEOUT,
        ):
            pass
    except urllib.error.HTTPError as exc:
        if exc.code is None:
            raise
    except Exception as exc:
        raise RuntimeError(
            f"无法连接到 HuggingFace（{_HF_URL} 不可达），"
            "请检查网络连接后重试，或手动下载模型放到 "
            f"{_FASTEMBED_CACHE_DIR} 目录。"
        ) from exc


def _ensure_model_from_hf(
    model_class: Any,
    model_name: str,
    cache_dir: Path,
) -> bool:
    """对无 GCS 源的模型，从 HuggingFace 下载（带超时保护）。

    返回 True 表示模型文件已就绪。预检不可达时 5 秒内快速失败。
    """
    import socket

    spec = _list_supported_models(model_class, model_name)
    if spec is None:
        return False

    sources = spec.get("sources", {})
    hf_repo = sources.get("hf")
    if not hf_repo:
        return False

    model_file = spec.get("model_file", "")
    additional_files = spec.get("additional_files", []) or []
    allow_patterns = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "preprocessor_config.json",
        model_file,
    ]
    allow_patterns.extend(additional_files)

    snapshot_dir = cache_dir / f"models--{hf_repo.replace('/', '--')}"
    source_key = f"hf:{model_name}"
    if snapshot_dir.exists() and any(snapshot_dir.rglob("*.onnx")):
        _clear_download_failure(source_key)
        return True

    cached_failure = _download_failure_message(source_key)
    if cached_failure is not None:
        raise RuntimeError(cached_failure)

    old_etag = os.environ.get("HF_HUB_ETAG_TIMEOUT")
    old_dl = os.environ.get("HF_HUB_DOWNLOAD_TIMEOUT")
    old_pbar = os.environ.get("HF_HUB_DISABLE_PROGRESS_BARS")
    try:
        _check_hf_reachable()
        from huggingface_hub import snapshot_download

        logger.info("从 HuggingFace 下载 fastembed 模型: {}", hf_repo)
        os.environ["HF_HUB_ETAG_TIMEOUT"] = "30"
        os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = "120"
        os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
        snapshot_download(
            repo_id=hf_repo,
            allow_patterns=allow_patterns,
            cache_dir=str(cache_dir),
        )
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
        message = (
            f"内置模型下载失败（HuggingFace 不可达或超时）: {hf_repo}\n"
            f"错误: {exc}\n"
            "请检查网络连接后重试。"
        )
        _record_download_failure(source_key, message)
        raise RuntimeError(message) from exc
    except Exception as exc:
        message = f"内置模型下载失败（HuggingFace）: {hf_repo}\n错误: {exc}"
        _record_download_failure(source_key, message)
        raise RuntimeError(message) from exc
    finally:
        if old_etag is None:
            os.environ.pop("HF_HUB_ETAG_TIMEOUT", None)
        else:
            os.environ["HF_HUB_ETAG_TIMEOUT"] = old_etag
        if old_dl is None:
            os.environ.pop("HF_HUB_DOWNLOAD_TIMEOUT", None)
        else:
            os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = old_dl
        if old_pbar is None:
            os.environ.pop("HF_HUB_DISABLE_PROGRESS_BARS", None)
        else:
            os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = old_pbar

    logger.info("fastembed 模型已缓存(HF): {} -> {}", model_name, snapshot_dir)
    _clear_download_failure(source_key)
    return True


def _instantiate_fastembed_model(
    model_class: Any,
    model_name: str,
    cache_dir: Path,
    specific_model_path: Path | None = None,
) -> Any:
    """构造 fastembed 模型，按能力逐级降级以兼容不同版本与测试替身。"""
    kwargs: dict[str, Any] = {"model_name": model_name, "cache_dir": str(cache_dir)}
    if specific_model_path is not None:
        kwargs["specific_model_path"] = str(specific_model_path)
    try:
        return model_class(**kwargs)
    except TypeError as exc:
        message = str(exc)
        if "specific_model_path" in message and specific_model_path is not None:
            # 版本或替身不支持直接指定模型路径：退回原有下载流程。
            return _instantiate_fastembed_model(model_class, model_name, cache_dir)
        if "cache_dir" not in message:
            raise
        kwargs.pop("cache_dir", None)
        kwargs.pop("specific_model_path", None)
        return model_class(**kwargs)


def _model_cache_key(model_class: Any, model_name: str) -> tuple[str, str]:
    module = getattr(model_class, "__module__", "") or ""
    qualname = (
        getattr(model_class, "__qualname__", None)
        or getattr(model_class, "__name__", None)
        or repr(model_class)
    )
    return (f"{module}.{qualname}", model_name)


def invalidate_fastembed_model_cache(model_name: str | None = None) -> None:
    """清理进程级模型实例缓存。

    传入 ``model_name`` 时只清理该模型，否则清空全部。
    模型文件被重新下载或被替换后可调用此函数，避免继续复用旧实例。
    """
    with _model_cache_guard:
        if model_name is None:
            _model_instances.clear()
            return
        for key in [key for key in _model_instances if key[1] == model_name]:
            _model_instances.pop(key, None)


def _load_fastembed_model_uncached(model_class: Any, model_name: str) -> Any:
    """实际执行模型准备与实例化（不含缓存）。

    随包内置模型优先，命中时零网络请求；否则按 GCS → HuggingFace 顺序下载。
    """
    cache_dir = _resolve_cache_dir()

    bundled_dir = _bundled_model_dir(model_name)
    if bundled_dir is not None:
        logger.info("使用随包内置的 fastembed 模型: {} -> {}", model_name, bundled_dir)
        return _instantiate_fastembed_model(
            model_class,
            model_name,
            cache_dir,
            specific_model_path=bundled_dir,
        )

    gcs_ready = _ensure_model_from_gcs(model_class, model_name, cache_dir)
    if gcs_ready:
        old_state = _set_hf_offline(True)
        try:
            return _instantiate_fastembed_model(model_class, model_name, cache_dir)
        finally:
            _restore_hf_offline(old_state)

    hf_ready = _ensure_model_from_hf(model_class, model_name, cache_dir)
    if hf_ready:
        old_state = _set_hf_offline(True)
        try:
            return _instantiate_fastembed_model(model_class, model_name, cache_dir)
        finally:
            _restore_hf_offline(old_state)

    return _instantiate_fastembed_model(model_class, model_name, cache_dir)


def _load_fastembed_model(model_class: Any, model_name: str) -> Any:
    """加载 fastembed 模型，顺序为：随包内置 → GCS → HuggingFace。

    内置模型直接以 specific_model_path 加载，国内网络下无需任何下载。
    未内置的模型（如内置重排模型）才走网络，带超时保护，不可达时快速失败。

    结果按 (模型类, 模型名) 做进程级缓存，并对同一模型使用单飞锁，
    避免并发检索重复构造 onnx 会话。
    """
    key = _model_cache_key(model_class, model_name)
    with _model_cache_guard:
        cached = _model_instances.get(key)
        if cached is not None:
            return cached
        lock = _model_locks.setdefault(key, threading.Lock())

    with lock:
        with _model_cache_guard:
            cached = _model_instances.get(key)
            if cached is not None:
                return cached
        model = _load_fastembed_model_uncached(model_class, model_name)
        with _model_cache_guard:
            _model_instances[key] = model
        return model


class FastEmbedEmbeddings(Embeddings):
    """基于 fastembed TextEmbedding 的 LangChain Embeddings 实现。"""

    def __init__(self, model_name: str) -> None:
        try:
            from fastembed import TextEmbedding
        except ModuleNotFoundError as exc:
            raise ImportError("fastembed 未安装。请运行 uv sync 安装依赖。") from exc

        self._model_name = model_name
        self._model = _load_fastembed_model(TextEmbedding, model_name)
        logger.info("FastEmbed 内置向量模型已加载: {}", model_name)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [list(emb) for emb in self._model.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        return list(next(iter(self._model.embed([text]))))

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.to_thread(self.embed_documents, texts)

    async def aembed_query(self, text: str) -> list[float]:
        return await asyncio.to_thread(self.embed_query, text)


__all__ = [
    "FastEmbedEmbeddings",
    "_load_fastembed_model",
    "invalidate_fastembed_model_cache",
]
