"""Application errors and the handlers that turn them into a client-safe JSON envelope.

Every error response has the same shape: `{"error": {"code": "...", "message": "..."}}`.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("bcom.errors")


class AppError(Exception):
    """An error whose message is safe and useful to show to the partner."""

    def __init__(self, message: str, *, status_code: int, code: str) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


async def _app_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status_code)


async def _validation_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    log.info("invalid request: %s", exc.errors()[:5])
    return JSONResponse(
        error_body("invalid_request", "The request data is not in the expected format."),
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
    )


async def _unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    log.exception("unexpected error", exc_info=exc)
    return JSONResponse(
        error_body("internal_error", "Something went wrong. Please try again."),
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)
