from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from smoke.conftest import (
    DISABLED_PROVIDER_MODEL,
    provider_model_params,
    provider_xdist_group,
)
from smoke.lib.config import (
    ALL_TARGETS,
    DEFAULT_TARGETS,
    OPENROUTER_FREE_CLI_DEFAULT_MODELS,
    OPT_IN_TARGETS,
    TARGET_REQUIRED_ENV,
    SmokeConfig,
    openrouter_free_cli_model_refs,
)


def _settings(**overrides):
    values = {
        "model": "open_router/anthropic/claude-3.5-sonnet",
        "model_opus": None,
        "model_sonnet": None,
        "model_haiku": None,
        "open_router_api_key": "",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _smoke_config(**overrides) -> SmokeConfig:
    values = {
        "root": Path("."),
        "results_dir": Path(".smoke-results"),
        "live": False,
        "interactive": False,
        "targets": DEFAULT_TARGETS,
        "provider_matrix": frozenset(),
        "timeout_s": 45.0,
        "prompt": "Reply with exactly: FCC_SMOKE_PONG",
        "claude_bin": "claude",
        "worker_id": "main",
        "settings": _settings(),
    }
    values.update(overrides)
    return SmokeConfig(**values)


def test_openrouter_free_cli_is_opt_in_smoke_target() -> None:
    assert "openrouter_free_cli" not in DEFAULT_TARGETS
    assert "openrouter_free_cli" in OPT_IN_TARGETS
    assert "openrouter_free_cli" in ALL_TARGETS
    assert "openrouter_free_cli" in TARGET_REQUIRED_ENV


def test_provider_smoke_models_cover_configured_providers_independent_of_model_mapping(
    monkeypatch,
) -> None:
    monkeypatch.delenv("FCC_SMOKE_MODEL_OPEN_ROUTER", raising=False)
    config = _smoke_config(
        settings=_settings(
            model="open_router/anthropic/claude-3.5-sonnet",
            open_router_api_key="openrouter-key",
        )
    )

    models = config.provider_smoke_models()

    assert [model.provider for model in models] == ["open_router"]
    assert models[0].full_model == "open_router/moonshotai/kimi-k2.6:free"
    assert models[0].source == "provider_default"


def test_openrouter_provider_smoke_uses_concrete_free_model(monkeypatch) -> None:
    monkeypatch.delenv("FCC_SMOKE_MODEL_OPEN_ROUTER", raising=False)
    config = _smoke_config(settings=_settings(open_router_api_key="openrouter-key"))

    models = config.provider_smoke_models()

    assert [model.provider for model in models] == ["open_router"]
    assert models[0].full_model == "open_router/moonshotai/kimi-k2.6:free"
    assert models[0].source == "provider_default"


def test_provider_smoke_model_override_accepts_model_name_without_prefix(
    monkeypatch,
) -> None:
    monkeypatch.setenv("FCC_SMOKE_MODEL_OPEN_ROUTER", "moonshotai/kimi-k2.6:free")
    config = _smoke_config(
        settings=_settings(
            open_router_api_key="openrouter-key",
        ),
        provider_matrix=frozenset({"open_router"}),
    )

    models = config.provider_smoke_models()

    assert models[0].full_model == "open_router/moonshotai/kimi-k2.6:free"
    assert models[0].source == "FCC_SMOKE_MODEL_OPEN_ROUTER"


def test_provider_smoke_model_override_accepts_owner_model_name(
    monkeypatch,
) -> None:
    monkeypatch.setenv("FCC_SMOKE_MODEL_OPEN_ROUTER", "moonshotai/kimi-k2.6:free")
    config = _smoke_config(
        settings=_settings(
            model="open_router/moonshotai/kimi-k2.6:free",
            open_router_api_key="openrouter-key",
        ),
        provider_matrix=frozenset({"open_router"}),
    )

    models = config.provider_smoke_models()

    assert models[0].full_model == "open_router/moonshotai/kimi-k2.6:free"
    assert models[0].source == "FCC_SMOKE_MODEL_OPEN_ROUTER"


def test_provider_smoke_model_override_rejects_wrong_provider_prefix(
    monkeypatch,
) -> None:
    # Set to a provider prefix that is not open_router
    monkeypatch.setenv("FCC_SMOKE_MODEL_OPEN_ROUTER", "other_provider/model")
    config = _smoke_config(
        settings=_settings(
            open_router_api_key="openrouter-key",
        ),
        provider_matrix=frozenset({"open_router"}),
    )

    from unittest.mock import patch

    with patch(
        "smoke.lib.config.SUPPORTED_PROVIDER_IDS", ("open_router", "other_provider")
    ):
        try:
            config.provider_smoke_models()
        except ValueError as exc:
            assert "FCC_SMOKE_MODEL_OPEN_ROUTER" in str(exc)
        else:
            raise AssertionError("expected wrong provider prefix to fail")


def test_provider_smoke_matrix_filters_provider_catalog(monkeypatch) -> None:
    monkeypatch.delenv("FCC_SMOKE_MODEL_OPEN_ROUTER", raising=False)
    config = _smoke_config(
        settings=_settings(
            open_router_api_key="openrouter-key",
        ),
        provider_matrix=frozenset({"open_router"}),
    )

    assert [model.provider for model in config.provider_smoke_models()] == [
        "open_router"
    ]


def test_provider_smoke_collection_params_are_grouped_by_provider(
    monkeypatch,
) -> None:
    monkeypatch.delenv("FCC_SMOKE_MODEL_OPEN_ROUTER", raising=False)
    config = _smoke_config(
        live=True,
        settings=_settings(
            open_router_api_key="openrouter-key",
        ),
    )

    params = provider_model_params(config)

    assert [param.id for param in params] == ["open_router"]
    groups = [
        mark.args[0]
        for param in params
        for mark in param.marks
        if mark.name == "xdist_group"
    ]
    assert groups == ["provider:open_router"]


def test_provider_smoke_collection_uses_disabled_placeholder_when_not_live() -> None:
    config = _smoke_config(live=False, settings=_settings())

    params = provider_model_params(config)

    assert [param.values[0] for param in params] == [DISABLED_PROVIDER_MODEL]
    assert provider_xdist_group(DISABLED_PROVIDER_MODEL) == "provider:smoke_disabled"


def test_openrouter_free_cli_default_models_are_normalized() -> None:
    refs = openrouter_free_cli_model_refs({})

    assert tuple(refs) == tuple(
        f"open_router/{model}" for model in OPENROUTER_FREE_CLI_DEFAULT_MODELS
    )
    assert "open_router/nvidia/nemotron-3-super-120b-a12b:free" in refs
    assert "open_router/poolside/laguna-m.1:free" in refs
    assert set(refs.values()) == {"openrouter_free_cli_default"}


def test_openrouter_free_cli_models_override_and_append() -> None:
    refs = openrouter_free_cli_model_refs(
        {
            "FCC_SMOKE_OPENROUTER_FREE_MODELS": (
                "openai/gpt-oss-120b:free,open_router/custom/model:free"
            ),
            "FCC_SMOKE_OPENROUTER_FREE_EXTRA_MODELS": (
                "poolside/laguna-m.1:free,openai/gpt-oss-120b:free"
            ),
        }
    )

    assert tuple(refs) == (
        "open_router/openai/gpt-oss-120b:free",
        "open_router/custom/model:free",
        "open_router/poolside/laguna-m.1:free",
    )
    assert refs["open_router/openai/gpt-oss-120b:free"] == (
        "FCC_SMOKE_OPENROUTER_FREE_MODELS"
    )
    assert refs["open_router/poolside/laguna-m.1:free"] == (
        "FCC_SMOKE_OPENROUTER_FREE_EXTRA_MODELS"
    )


def test_openrouter_free_cli_models_reject_empty_override() -> None:
    try:
        openrouter_free_cli_model_refs({"FCC_SMOKE_OPENROUTER_FREE_MODELS": " , "})
    except ValueError as exc:
        assert "FCC_SMOKE_OPENROUTER_FREE_MODELS" in str(exc)
    else:
        raise AssertionError("expected empty OpenRouter free CLI override to fail")


def test_openrouter_free_cli_models_reject_wrong_provider_prefix() -> None:
    from unittest.mock import patch

    with patch(
        "smoke.lib.config.SUPPORTED_PROVIDER_IDS", ("open_router", "other_provider")
    ):
        try:
            openrouter_free_cli_model_refs(
                {"FCC_SMOKE_OPENROUTER_FREE_MODELS": "other_provider/model"}
            )
        except ValueError as exc:
            assert "open_router" in str(exc)
        else:
            raise AssertionError("expected wrong provider prefix to fail")


def test_smoke_config_returns_openrouter_free_cli_provider_models(monkeypatch) -> None:
    monkeypatch.delenv("FCC_SMOKE_OPENROUTER_FREE_MODELS", raising=False)
    monkeypatch.delenv("FCC_SMOKE_OPENROUTER_FREE_EXTRA_MODELS", raising=False)
    config = _smoke_config(
        settings=_settings(
            model="open_router/openai/gpt-oss-120b:free",
            open_router_api_key="openrouter-key",
        )
    )

    models = config.openrouter_free_cli_models()

    assert models[0].provider == "open_router"
    assert models[0].full_model == "open_router/nvidia/nemotron-3-super-120b-a12b:free"
    assert models[0].source == "openrouter_free_cli_default"
