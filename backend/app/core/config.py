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
    # A second engine to try when the first is busy, rate-limited or failing ("none" to turn off).
    ai_fallback_provider: Literal["none", "gemini", "openai"] = "none"

    gemini_api_key: str = Field(default="", repr=False)
    # Free-tier Gemini keys may let Google use the data: the app then warns against real customer invoices.
    gemini_paid_key: bool = False
    # Benchmarked 19 Nov 2026 on 10 invoices incl. tilted photos: 100% correct, ~20 s. Half the price of
    # gemini-4-hydrogen (also 100%) until Google raises it on 1 Jan 2027.
    gemini_model: str = "gemini-3.8-flash"
    # Cheapest model, used only when the main model is busy or out of quota; "none" turns it off.
    gemini_fallback_model: str = "gemini-3.5-flash-lite"
    # Reading a table needs little reasoning; "low" is much faster than the model default.
    gemini_thinking_level: GeminiThinkingLevel = "low"

    openai_api_key: str = Field(default="", repr=False)
    openai_model: str = "gpt-6.1-terra"

    # Longest a single AI request may take, and the whole read including retries and fallback.
    # A large or photographed invoice can take ~40 s on the stronger models; leave room for one fallback.
    ai_request_timeout_seconds: float = Field(default=60, gt=0, le=300)
    ai_total_timeout_seconds: float = Field(default=100, gt=0, le=600)

    # Accept only the bundled sample invoices (for public demos on a free AI tier).
    allow_only_sample_files: bool = False

    # Largest invoice file accepted, in MB.
    max_upload_mb: float = Field(default=10, gt=0, le=30)

    # Rates used to convert other invoice currencies to AED before comparing (AED per 1 unit).
    # USD is the UAE dirham's fixed peg. Add others as JSON, e.g. FX_RATES_TO_AED={"USD":3.6725,"EUR":4.0}
    fx_rates_to_aed: dict[str, float] = Field(default_factory=lambda: {"USD": 3.6725})

    # Requests per minute per client for the endpoints that call the AI provider; 0 turns it off.
    rate_limit_per_minute: int = Field(default=20, ge=0, le=10_000)

    # PostgreSQL (asyncpg driver). `docker compose up -d db` in backend/ starts one on port 5440.
    database_url: str = Field(
        default="postgresql+asyncpg://bcom:bcom@localhost:5440/bcom", repr=False
    )
    # Open a fresh connection per use instead of pooling (tests: TestClient runs its own event loop).
    database_null_pool: bool = False
    # Time zone for "today" in follow-up reminders (the partners work in the UAE).
    timezone: str = "Asia/Dubai"
    # Days after "Mark as sent" before the proposal shows under "Follow up today".
    follow_up_days: int = Field(default=3, ge=1, le=60)
    # Where the frontend lives, to build the customer's link.
    public_app_url: str = "http://localhost:3000"

    # Pass lessons from partners' corrections to the AI on new reads.
    reading_hints: bool = True
    # Error reporting to Sentry; empty turns it off.
    sentry_dsn: str = Field(default="", repr=False)

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
