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

    # Rates used to convert other invoice currencies to AED before comparing (AED per 1 unit).
    # USD is the UAE dirham's fixed peg. Add others as JSON, e.g. FX_RATES_TO_AED={"USD":3.6725,"EUR":4.0}
    fx_rates_to_aed: dict[str, float] = Field(default_factory=lambda: {"USD": 3.6725})

    # Requests per minute per client for the endpoints that call the AI provider; 0 turns it off.
    rate_limit_per_minute: int = Field(default=20, ge=0, le=10_000)

    # Re-uploading the same file returns the earlier reading instead of calling the AI again.
    extract_cache_size: int = Field(default=64, ge=0, le=10_000)
    extract_cache_ttl_seconds: int = Field(default=3600, ge=0)

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

    @field_validator("fx_rates_to_aed")
    @classmethod
    def _check_rates(cls, rates: dict[str, float]) -> dict[str, float]:
        cleaned = {code.strip().upper(): rate for code, rate in rates.items()}
        for code, rate in cleaned.items():
            if len(code) != 3 or not code.isalpha() or rate <= 0:
                raise ValueError(f"invalid exchange rate entry: {code}={rate}")
        return cleaned

    @property
    def log_json(self) -> bool:
        """JSON logs everywhere except local development, where readable lines are nicer."""
        return self.app_env != "development"

    @property
    def gemini_fallback(self) -> str | None:
        fallback = self.gemini_fallback_model.strip()
        if fallback.lower() == "none" or fallback == self.gemini_model:
            return None
        return fallback


@lru_cache
def get_settings() -> Settings:
    return Settings()
