"""Builds the AI provider selected by AI_PROVIDER (mock | gemini | openai), with an optional back-up reader
(AI_FALLBACK_PROVIDER) that takes over when the first one is busy, rate-limited or failing."""

from functools import lru_cache

from app.clients.ai.base import AIProvider
from app.clients.ai.fallback import FallbackProvider
from app.clients.ai.gemini import GeminiProvider, GeminiSettings
from app.clients.ai.mock import MockProvider
from app.clients.ai.openai_provider import OpenAIProvider
from app.core.config import ProviderId, Settings, get_settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

log = get_logger("bcom.ai")


def _build(provider_id: ProviderId, settings: Settings) -> AIProvider:
    match provider_id:
        case "gemini":
            if not settings.gemini_api_key:
                raise AppError(
                    "AI_PROVIDER is gemini but GEMINI_API_KEY is empty in .env.",
                    status_code=500,
                    code="ai_not_configured",
                )
            return GeminiProvider(
                GeminiSettings(
                    api_key=settings.gemini_api_key,
                    model=settings.gemini_model,
                    fallback_model=settings.gemini_fallback,
                    thinking_level=settings.gemini_thinking_level,
                    request_timeout_seconds=settings.ai_request_timeout_seconds,
                    total_timeout_seconds=settings.ai_total_timeout_seconds,
                )
            )
        case "openai":
            if not settings.openai_api_key:
                raise AppError(
                    "AI_PROVIDER is openai but OPENAI_API_KEY is empty in .env.",
                    status_code=500,
                    code="ai_not_configured",
                )
            return OpenAIProvider(
                settings.openai_api_key, settings.openai_model, settings.ai_request_timeout_seconds
            )
        case "mock":
            return MockProvider()


@lru_cache
def get_ai_provider() -> AIProvider:
    settings = get_settings()
    primary = _build(settings.ai_provider, settings)
    backup_id = settings.ai_fallback_provider
    if backup_id == "none" or backup_id == settings.ai_provider or settings.ai_provider == "mock":
        return primary
    try:
        backup = _build(backup_id, settings)
    except AppError:
        # A back-up without a key is simply not used; the main reader still works.
        log.warning("back-up reader not configured, continuing without it", backup=backup_id)
        return primary
    return FallbackProvider(primary, backup)
