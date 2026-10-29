"""
Domain-specific errors.
"""


class NovelForgeError(Exception):
    """Base exception for NovelForge."""

    pass


class ProviderError(NovelForgeError):
    """Error from model provider."""

    error_type: str = "provider_error"
    status_code: int = 500


class RateLimitError(ProviderError):
    """Provider rate limit exceeded."""

    error_type = "provider_rate_limit"
    status_code = 429


class ProviderAuthError(ProviderError):
    """Provider authentication error."""

    error_type = "provider_auth"
    status_code = 401


class ProviderTimeoutError(ProviderError):
    """Provider request timed out."""

    error_type = "provider_timeout"
    status_code = 504


class LLMTimeoutError(ProviderTimeoutError):
    """LLM调用超时。"""

    pass


class AgentTimeoutError(NovelForgeError):
    """Agent execution timed out."""

    pass


class StorageError(NovelForgeError):
    """Storage/persistence error."""

    pass


class NotFoundError(NovelForgeError):
    """资源不存在错误。"""

    pass


class ValidationError(NovelForgeError):
    """验证错误。"""

    pass


class ConflictError(NovelForgeError):
    """资源冲突错误。"""

    pass


class ProjectAlreadyBoundError(NovelForgeError):
    """项目已绑定世界书错误。"""

    pass


class WorldInfoExistsError(NovelForgeError):
    """世界书已存在错误。"""

    pass
