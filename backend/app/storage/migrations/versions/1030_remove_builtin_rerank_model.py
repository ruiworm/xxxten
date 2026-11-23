"""Remove the builtin local rerank model.

Revision ID: 1030
Revises: 1029

内置重排模型（Xenova/ms-marco-MiniLM-L-6-v2）只有 HuggingFace 源，国内无法下载，
且为英文段落匹配模型，对中文小说检索收益有限。代码侧已移除该内置模型，
此处清理存量数据库：先关闭引用它的重排开关，再删除模型行。
远端 rerank 模型（用户自行配置的提供商）不受影响。
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision: str = "1030"
down_revision: str = "1029"
branch_labels: str | None = None
depends_on: str | None = None


_BUILTIN_PROVIDER_ID = "builtin-local"
_BUILTIN_RERANK_MODEL_ID = "builtin-rerank-ms-marco-minilm-l6-v2"
_KEY_RERANK_ENABLED = "index_rerank_enabled"
_KEY_DEFAULT_RERANK_MODEL = "default_rerank_model"


def upgrade() -> None:
    connection = op.get_bind()

    selected = connection.execute(
        sa.text("SELECT value FROM settings WHERE key = :key"),
        {"key": _KEY_DEFAULT_RERANK_MODEL},
    ).first()

    if selected is not None and selected[0] == _BUILTIN_RERANK_MODEL_ID:
        connection.execute(
            sa.text("UPDATE settings SET value = 'false' WHERE key = :key"),
            {"key": _KEY_RERANK_ENABLED},
        )
        connection.execute(
            sa.text("UPDATE settings SET value = '' WHERE key = :key"),
            {"key": _KEY_DEFAULT_RERANK_MODEL},
        )

    connection.execute(
        sa.text(
            "DELETE FROM models WHERE id = :model_id AND provider_id = :provider_id"
        ),
        {"model_id": _BUILTIN_RERANK_MODEL_ID, "provider_id": _BUILTIN_PROVIDER_ID},
    )


def downgrade() -> None:
    # 模型文件不再随包分发，恢复行只会得到不可用的模型；旧版本启动时
    # seed_builtin_models 会按需重建，因此此处不做恢复。
    pass
