from fastapi import APIRouter

from app.clients.ai.factory import get_ai_provider
from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.schemas.api import ConfigResponse

router = APIRouter(tags=["config"])

FREE_TIER_NOTICE = (
    "This server uses the free Gemini tier, where Google may use uploaded data to improve its products. "
    "Use the sample invoices only, not real customer invoices."
)


def privacy_notice(settings: Settings) -> str | None:
    uses_gemini = settings.ai_provider == "gemini" or (
        settings.ai_provider != "mock" and settings.ai_fallback_provider == "gemini"
    )
    return FREE_TIER_NOTICE if uses_gemini and not settings.gemini_paid_key else None


@router.get("/config")
async def read_config() -> ConfigResponse:
    """Tells the frontend which AI provider is active and what to warn about (never exposes keys)."""
    settings = get_settings()
    common = {
        "max_upload_mb": settings.max_upload_mb,
        "privacy_notice": privacy_notice(settings),
        "samples_only": settings.allow_only_sample_files,
    }
    try:
        provider = get_ai_provider()
    except AppError as error:
        return ConfigResponse(provider=None, problem=error.message, **common)
    return ConfigResponse(provider=provider.info, problem=None, **common)
