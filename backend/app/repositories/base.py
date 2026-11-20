"""Generic async repository. Repositories are the only layer that touches the database; services use
them and never the session directly (team standard, as in apollo-backend)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base


class BaseRepository[ModelT: Base]:
    model: type[ModelT]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, id: Any) -> ModelT | None:
        return await self.db.get(self.model, id)

    async def add(self, obj: ModelT) -> ModelT:
        self.db.add(obj)
        await self.db.flush()  # assigns ids and defaults without ending the request's transaction
        return obj

    async def delete(self, obj: ModelT) -> None:
        await self.db.delete(obj)
        await self.db.flush()
