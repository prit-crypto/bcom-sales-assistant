from fastapi import APIRouter

from app.clients.ai.factory import get_ai_provider
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.schemas.api import ConfigResponse

router = APIRouter(tags=["config"])


@router.get("/config")
async def read_config() -> ConfigResponse:
    """Tells the frontend which AI provider is active (never exposes keys)."""
    settings = get_settings()
    try:
        provider = get_ai_provider()
    except AppError as error:
        return ConfigResponse(
            provider=None, problem=error.message, max_upload_mb=settings.max_upload_mb
        )
    return ConfigResponse(
        provider=provider.info, problem=None, max_upload_mb=settings.max_upload_mb
    )
