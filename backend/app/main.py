"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import MaxBodySizeMiddleware, RequestContextMiddleware

# Room for multipart headers and form fields around the file itself.
_REQUEST_OVERHEAD_BYTES = 1024 * 1024


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(json=settings.log_json)

    app = FastAPI(
        title="BCOM Sales Assistant API",
        version="0.1.0",
        description=(
            "Reads a prospect's courier invoice, compares it with the (fictional) BCOM rate card, "
            "and builds the customer proposal PDF and WhatsApp message."
        ),
    )
    # Starlette runs the last-added middleware first: request ids wrap everything, CORS headers are
    # added even to size errors, and oversized requests are refused before they are read.
    app.add_middleware(
        MaxBodySizeMiddleware,
        max_bytes=int(settings.max_upload_mb * 1024 * 1024) + _REQUEST_OVERHEAD_BYTES,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Request-ID"],
        expose_headers=["Content-Disposition", "X-Request-ID", "X-Cache"],
    )
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
