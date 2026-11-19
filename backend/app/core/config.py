"""Application settings, read from the environment and `.env` (pydantic-settings)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ProviderId = Literal["mock", "gemini", "openai"]
GeminiThinkingLevel = Literal["minimal", "low", "medium", "high", "default"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "staging", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    # Comma-separated list of frontend origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:3000"

    # Which engine reads invoices and writes WhatsApp messages.
    ai_provider: ProviderId = "mock"

    gemini_api_key: str = Field(default="", repr=False)
    gemini_model: str = "gemini-3.5-flash-lite"
    # Used when the main model is busy or out of quota; "none" turns it off.
    gemini_fallback_model: str = "gemini-3.8-flash"
    # Reading a table needs little reasoning; "low" is much faster than the model default.
    gemini_thinking_level: GeminiThinkingLevel = "low"

    openai_api_key: str = Field(default="", repr=False)
    openai_model: str = "gpt-6.1-terra"

    # Longest a single AI request may take, and the whole read including retries and fallback.
    ai_request_timeout_seconds: float = Field(default=40, gt=0, le=300)
    ai_total_timeout_seconds: float = Field(default=55, gt=0, le=600)

    # Largest invoice file accepted, in MB.
    max_upload_mb: float = Field(default=10, gt=0, le=30)

    @field_validator(
        "ai_provider",
        "gemini_model",
        "gemini_fallback_model",
        "gemini_thinking_level",
        "openai_model",
        mode="before",
    )
    @classmethod
    def _empty_means_default(cls, value: object, info: ValidationInfo) -> object:
        # `KEY=` in .env should behave like "not set", not like an empty string.
        if value == "" and info.field_name:
            return cls.model_fields[info.field_name].default
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def gemini_fallback(self) -> str | None:
        fallback = self.gemini_fallback_model.strip()
        if fallback.lower() == "none" or fallback == self.gemini_model:
            return None
        return fallback


@lru_cache
def get_settings() -> Settings:
    return Settings()
