"""Aggregates all v1 endpoint routers."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    comparisons,
    config,
    exports,
    health,
    invoices,
    messages,
    proposals,
    saved_proposals,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(config.router)
api_router.include_router(invoices.router)
api_router.include_router(comparisons.router)
api_router.include_router(proposals.router)
api_router.include_router(saved_proposals.router)
api_router.include_router(messages.router)
api_router.include_router(exports.router)
