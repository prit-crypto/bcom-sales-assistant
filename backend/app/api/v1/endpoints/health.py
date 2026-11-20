from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db.session import database_ready
from app.schemas.api import HealthResponse, ReadinessResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> HealthResponse:
    """The process is up (liveness)."""
    return HealthResponse()


@router.get(
    "/health/ready", response_model=ReadinessResponse, responses={503: {"model": ReadinessResponse}}
)
async def ready() -> ReadinessResponse | JSONResponse:
    """The app can do its work: the database answers (readiness, used by Docker healthchecks)."""
    if await database_ready():
        return ReadinessResponse(status="ok", database="ok")
    return JSONResponse(
        ReadinessResponse(status="unavailable", database="unreachable").model_dump(),
        status_code=503,
    )
