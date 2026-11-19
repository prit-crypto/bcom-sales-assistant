"""Aggregates all v1 endpoint routers."""

from fastapi import APIRouter

from app.api.v1.endpoints import comparisons, config, health, invoices, messages, proposals

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(config.router)
api_router.include_router(invoices.router)
api_router.include_router(comparisons.router)
api_router.include_router(proposals.router)
api_router.include_router(messages.router)
