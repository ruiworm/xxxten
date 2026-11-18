"""Tests for web_search tool and providers."""

import json
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import respx
from ddgs.exceptions import DDGSException
from httpx import Response

from app.agent_runtime.tools.errors import ToolExecutionError
from app.agent_runtime.tools.impls.web_search.config import (
    parse_web_search_settings,
    serialize_web_search_settings,
    WebSearchSettings,
)
from app.agent_runtime.tools.impls.web_search.providers import (
    get_provider,
    list_provider_metadata,
    list_provider_names,
)
from app.agent_runtime.tools.impls.web_search.providers.base import (
    WebSearchProviderConfig,
    WebSearchResult,
)
from app.agent_runtime.tools.impls.web_search.result_filter import filter_web_search_results
from app.core.encryption import EncryptionService
from app.settings import settings


def _make_state() -> dict:
    return {
        "session_id": "sess-1",
        "task_id": "task-1",
        "project_id": "proj-1",
        "model_config": {},
        "active_agent": None,
        "is_completed": False,
        "error": None,
        "retry_count": 0,
        "message_checkpoints": [],
        "user_request": "",
        "current_revision_id": "rev-1",
    }


def _provider_config(**overrides) -> WebSearchProviderConfig:
    defaults = {
        "api_key": "test-key",
        "max_results": 8,
        "extras": {},
        "trust_proxy_environment": True,
    }
    defaults.update(overrides)
    return WebSearchProviderConfig(**defaults)


def _make_tool():
    from app.agent_runtime.tools.impls.web_search.web_search import WebSearchTool

    return WebSearchTool(_state=_make_state())


def _encrypt(value: str) -> str:
    return EncryptionService(settings.encryption_key).encrypt(value)


class TestProviderRegistry:
    def test_all_providers_registered(self) -> None:
        assert set(list_provider_names()) == {
            "ddgs",
            "deepseek",
            "searxng",
            "zhipu",
        }

    def test_unknown_provider_returns_none(self) -> None:
        assert get_provider("unknown") is None

    def test_provider_metadata_sorted_and_typed(self) -> None:
        metadata = list_provider_metadata()
        names = [item["name"] for item in metadata]
        assert names == sorted(set(list_provider_names()))
        assert {item["name"] for item in metadata} == set(list_provider_names())

        by_name = {item["name"]: item for item in metadata}
        assert by_name["ddgs"]["requires_api_key"] is False
        ddgs_fields = {field["key"]: field for field in by_name["ddgs"]["fields"]}
        assert ddgs_fields["ddgs_backend"]["field_type"] == "select"
        assert ddgs_fields["ddgs_backend"]["options"] == [
            "auto",
            "brave",
            "duckduckgo",
            "grokipedia",
            "mojeek",
            "wikipedia",
            "yahoo",
            "startpage",
        ]
        zhipu_fields = {field["key"]: field for field in by_name["zhipu"]["fields"]}
        assert zhipu_fields["zhipu_search_engine"]["options"] == [
            "search_std",
            "search_pro",
            "search_pro_sogou",
            "search_pro_quark",
        ]
        assert by_name["searxng"]["requires_api_key"] is False
        assert by_name["zhipu"]["requires_api_key"] is True

        searxng_fields = {field["key"]: field for field in by_name["searxng"]["fields"]}
        assert searxng_fields["searxng_base_url"]["field_type"] == "text"
        assert searxng_fields["searxng_base_url"]["required"] is True

class TestWebSearchConfig:
    def test_parse_missing_raw_returns_defaults(self) -> None:
        parsed = parse_web_search_settings(None)

        assert parsed == WebSearchSettings()
        assert parsed.trust_proxy_environment is True
        assert parsed.bypass_ssrf_protection is False

    def test_parse_invalid_json_returns_defaults(self) -> None:
        assert parse_web_search_settings("not-json{") == WebSearchSettings()

    def test_parse_decrypts_api_keys(self) -> None:
        raw = json.dumps(
            {
                "enabled": True,
                "provider": "zhipu",
                "api_keys": {
                    "zhipu": _encrypt("zhipu-key"),
                    "deepseek": _encrypt("deepseek-key"),
                },
                "extras": {"doubao_model": "m1", "ignored": ""},
            }
        )
        parsed = parse_web_search_settings(raw)
        assert parsed.enabled is True
        assert parsed.provider == "zhipu"
        assert parsed.api_keys == {"zhipu": "zhipu-key", "deepseek": "deepseek-key"}
        assert parsed.extras == {"doubao_model": "m1"}

    def test_parse_legacy_api_key_for_current_provider(self) -> None:
        raw = json.dumps(
            {
                "provider": "zhipu",
                "api_key": _encrypt("legacy-key"),
            }
        )

        assert parse_web_search_settings(raw).api_keys == {"zhipu": "legacy-key"}

    def test_parse_missing_enabled_defaults_to_false(self) -> None:
        raw = json.dumps({"provider": "zhipu", "api_key": "", "extras": {}})
        assert parse_web_search_settings(raw).enabled is False

    def test_serialize_encrypts_api_keys_and_round_trips(self) -> None:
        raw = serialize_web_search_settings(
            WebSearchSettings(
                enabled=True,
                provider="zhipu",
                api_keys={"zhipu": "plain-key", "deepseek": "other-key"},
                max_results=12,
                domain_filters=["example.com"],
                extras={"a": "b"},
                trust_proxy_environment=False,
                bypass_ssrf_protection=True,
            )
        )
        payload = json.loads(raw)
        assert payload["enabled"] is True
        assert payload["api_keys"]["zhipu"] != "plain-key"
        assert "api_key" not in payload
        assert payload["trust_proxy_environment"] is False
        assert payload["bypass_ssrf_protection"] is True
        assert parse_web_search_settings(raw).api_keys == {
            "zhipu": "plain-key",
            "deepseek": "other-key",
        }
        parsed = parse_web_search_settings(raw)
        assert parsed.max_results == 12
        assert parsed.domain_filters == ["example.com"]
        assert parsed.trust_proxy_environment is False
        assert parsed.bypass_ssrf_protection is True

    def test_serialize_skips_empty_api_keys(self) -> None:
        raw = serialize_web_search_settings(WebSearchSettings(provider="zhipu"))
        assert json.loads(raw)["api_keys"] == {}

    def test_parse_common_search_settings(self) -> None:
        raw = json.dumps(
            {
                "max_results": 12,
                "domain_filters": [" Example.com ", "", "example.com", "docs.example.com"],
            }
        )

        parsed = parse_web_search_settings(raw)

        assert parsed.max_results == 12
        assert parsed.domain_filters == ["example.com", "docs.example.com"]


def test_filter_web_search_results_by_domains() -> None:
    results = [
        WebSearchResult(title="root", url="https://example.com/root"),
        WebSearchResult(title="subdomain", url="https://docs.example.com/page"),
        WebSearchResult(title="other", url="https://example.net/page"),
        WebSearchResult(title="invalid", url="not-a-url"),
    ]

    filtered = filter_web_search_results(results, [" Example.com "])

    assert [result.title for result in filtered] == ["other", "invalid"]


class TestWebSearchTool:
    @pytest.mark.asyncio
    async def test_disabled_returns_error_message(self) -> None:
        tool = _make_tool()
        with patch(
            "app.agent_runtime.tools.impls.web_search.web_search.create_session"
        ) as mock_cs:
            session = AsyncMock()
            mock_cs.return_value = session
            with patch(
                "app.agent_runtime.tools.impls.web_search.config.setting_repo.get_by_key",
                AsyncMock(return_value=None),
            ):
                result = await tool.ainvoke({"query": "hello"})

        payload = json.loads(result)
        assert payload["success"] is False
        assert "未启用" in payload["message"]
        session.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_unconfigured_returns_error_message(self) -> None:
        tool = _make_tool()
        raw = json.dumps({"enabled": True, "provider": "", "api_keys": {}, "extras": {}})
        with patch(
            "app.agent_runtime.tools.impls.web_search.web_search.create_session"
        ) as mock_cs:
            session = AsyncMock()
            mock_cs.return_value = session
            with patch(
                "app.agent_runtime.tools.impls.web_search.config.setting_repo.get_by_key",
                AsyncMock(return_value=MagicMock(value=raw)),
            ):
                result = await tool.ainvoke({"query": "hello"})

        payload = json.loads(result)
        assert payload["success"] is False
        assert "尚未配置" in payload["message"]
        session.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_unsupported_provider_returns_error(self) -> None:
        tool = _make_tool()
        raw = json.dumps(
            {"enabled": True, "provider": "unknown", "api_keys": {}, "extras": {}}
        )
        with patch(
            "app.agent_runtime.tools.impls.web_search.web_search.create_session"
        ) as mock_cs:
            session = AsyncMock()
            mock_cs.return_value = session
            with patch(
                "app.agent_runtime.tools.impls.web_search.config.setting_repo.get_by_key",
                AsyncMock(return_value=MagicMock(value=raw)),
            ):
                result = await tool.ainvoke({"query": "hello"})

        payload = json.loads(result)
        assert payload["success"] is False
        assert "不支持的搜索 provider" in payload["message"]

    @pytest.mark.asyncio
    @respx.mock
    async def test_searxng_end_to_end(self) -> None:
        tool = _make_tool()
        raw = json.dumps(
            {
                "enabled": True,
                "provider": "searxng",
                "api_keys": {},
                "extras": {"searxng_base_url": "https://searx.test"},
            }
        )
        route = respx.get(re.compile(r"^https://searx\.test/search\?")).mock(
            return_value=Response(
                200,
                json={
                    "results": [
                        {"title": "t1", "url": "https://a.com", "content": "s1"},
                        {"title": "t2", "url": "https://b.com", "content": "s2"},
                    ]
                },
            )
        )
        with patch(
            "app.agent_runtime.tools.impls.web_search.web_search.create_session"
        ) as mock_cs:
            session = AsyncMock()
            mock_cs.return_value = session
            with patch(
                "app.agent_runtime.tools.impls.web_search.config.setting_repo.get_by_key",
                AsyncMock(return_value=MagicMock(value=raw)),
            ):
                result = await tool.ainvoke({"query": "量子计算", "count": 5})

        payload = json.loads(result)
        assert payload["provider"] == "searxng"
        assert payload["query"] == "量子计算"
        assert payload["results"][0] == {
            "title": "t1",
            "url": "https://a.com",
            "snippet": "s1",
        }
        assert route.called

    @pytest.mark.asyncio
    @respx.mock
    async def test_drops_blocked_domains(self) -> None:
        tool = _make_tool()
        raw = json.dumps(
            {
                "enabled": True,
                "provider": "searxng",
                "api_keys": {},
                "max_results": 3,
                "domain_filters": ["blocked.example.com"],
                "extras": {"searxng_base_url": "https://searx.test"},
            }
        )
        respx.get(re.compile(r"^https://searx\.test/search\?")).mock(
            return_value=Response(
                200,
                json={
                    "results": [
                        {
                            "title": "blocked",
                            "url": "https://blocked.example.com/page",
                            "content": "blocked",
                        },
                        {
                            "title": "allowed",
                            "url": "https://allowed.example.com/page",
                            "content": "allowed",
                        },
                    ]
                },
            )
        )
        with patch(
            "app.agent_runtime.tools.impls.web_search.web_search.create_session"
        ) as mock_cs:
            session = AsyncMock()
            mock_cs.return_value = session
            with patch(
                "app.agent_runtime.tools.impls.web_search.config.setting_repo.get_by_key",
                AsyncMock(return_value=MagicMock(value=raw)),
            ):
                result = await tool.ainvoke({"query": "q", "count": 20})

        payload = json.loads(result)
        # provider 会先按 max_results 截断，再交给工具做域名过滤，
        # 所以这里给足配额，只验证屏蔽域名被剔除
        assert [item["title"] for item in payload["results"]] == ["allowed"]

    @pytest.mark.asyncio
    async def test_blank_query_returns_error(self) -> None:
        tool = _make_tool()
        result = await tool.ainvoke({"query": "   "})
        payload = json.loads(result)
        assert payload["success"] is False
        assert "检索关键词不能为空" in payload["message"]


class TestHttpProviders:
    @pytest.mark.asyncio
    @respx.mock
    async def test_http_provider_uses_configured_proxy_environment(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        provider = get_provider("searxng")()
        respx.get(re.compile(r"^https://searx\.test/search\?")).mock(
            return_value=Response(200, json={"results": []})
        )
        from app.agent_runtime.tools.impls.web_search.providers import base

        original_client = base.httpx.AsyncClient
        captured: dict[str, object] = {}

        def make_client(*args: object, **kwargs: object):
            captured.update(kwargs)
            return original_client(*args, **kwargs)

        monkeypatch.setattr(base.httpx, "AsyncClient", make_client)

        await provider.search(
            "q",
            _provider_config(
                extras={"searxng_base_url": "https://searx.test"},
                trust_proxy_environment=False,
            ),
        )

        assert captured["trust_env"] is False

    @pytest.mark.asyncio
    @respx.mock
    async def test_searxng_requires_base_url(self) -> None:
        provider = get_provider("searxng")()
        with pytest.raises(ToolExecutionError, match="searxng_base_url"):
            await provider.search("q", _provider_config(api_key=""))

    @pytest.mark.asyncio
    @respx.mock
    async def test_searxng_parses_results_and_truncates(self) -> None:
        provider = get_provider("searxng")()
        route = respx.get(
            re.compile(r"^https://searx\.example\.com/search\?")
        ).mock(
            return_value=Response(
                200,
                json={
                    "results": [
                        {"title": f"t{i}", "url": f"https://u{i}", "content": "c"}
                        for i in range(10)
                    ]
                },
            )
        )
        response = await provider.search(
            "q",
            _provider_config(
                api_key="",
                extras={"searxng_base_url": "https://searx.example.com/"},
            ),
        )
        assert route.called
        assert len(response.results) == 8

    @pytest.mark.asyncio
    @respx.mock
    async def test_http_error_wraps_status(self) -> None:
        provider = get_provider("searxng")()
        respx.get(re.compile(r"^https://searx\.test/search\?")).mock(
            return_value=Response(401, json={"error": "unauthorized"})
        )
        with pytest.raises(ToolExecutionError, match="HTTP 401"):
            await provider.search(
                "q",
                _provider_config(extras={"searxng_base_url": "https://searx.test"}),
            )


class TestSdkProviders:
    @pytest.mark.asyncio
    async def test_ddgs_parses_text_results(self) -> None:
        provider = get_provider("ddgs")()
        with patch(
            "app.agent_runtime.tools.impls.web_search.providers.ddgs.DDGS"
        ) as mock_cls:
            instance = mock_cls.return_value.__enter__.return_value
            instance.text.return_value = [
                {"title": "t", "href": "https://u", "body": "b"},
            ]
            response = await provider.search(
                "q",
                _provider_config(extras={"ddgs_backend": "grokipedia"}),
            )

        instance.text.assert_called_once()
        assert instance.text.call_args.args == ("q",)
        assert instance.text.call_args.kwargs["max_results"] == 8
        assert instance.text.call_args.kwargs["region"] == "wt-wt"
        assert instance.text.call_args.kwargs["backend"] == "grokipedia"
        assert response.results[0].model_dump() == {
            "title": "t",
            "url": "https://u",
            "snippet": "b",
        }

    @pytest.mark.asyncio
    async def test_ddgs_retries_aggregate_failure_before_returning_results(self) -> None:
        provider = get_provider("ddgs")()
        with patch(
            "app.agent_runtime.tools.impls.web_search.providers.ddgs._run_sync_search",
            side_effect=[
                DDGSException("temporary aggregate failure"),
                [{"title": "t", "href": "https://u", "body": "b"}],
            ],
        ) as mock_search:
            response = await provider.search("q", _provider_config())

        assert mock_search.call_count == 2
        assert response.results[0].url == "https://u"

    @pytest.mark.asyncio
    async def test_zhipu_parses_search_result(self) -> None:
        provider = get_provider("zhipu")()
        client = MagicMock()
        client.web_search.web_search.return_value = SimpleNamespace(
            search_result=[
                SimpleNamespace(
                    title="t",
                    link="https://u",
                    content="c",
                )
            ]
        )
        with patch(
            "app.agent_runtime.tools.impls.web_search.providers.zhipu.ZhipuAiClient",
            return_value=client,
        ) as mock_cls:
            response = await provider.search("q", _provider_config())
        mock_cls.assert_called_once_with(api_key="test-key")
        client.web_search.web_search.assert_called_once()
        call_kwargs = client.web_search.web_search.call_args.kwargs
        assert call_kwargs["search_query"] == "q"
        assert call_kwargs["search_engine"] == "search_std"
        assert response.results[0].model_dump() == {
            "title": "t",
            "url": "https://u",
            "snippet": "c",
        }


class TestProviderKeyValidation:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "name",
        ["zhipu", "deepseek"],
    )
    async def test_providers_require_api_key(self, name: str) -> None:
        provider = get_provider(name)()
        with pytest.raises(ToolExecutionError, match="API Key"):
            await provider.search("q", _provider_config(api_key=""))
