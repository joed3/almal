"""Application settings for the Almal backend."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file.

    Attributes:
        anthropic_api_key: API key for the Anthropic Claude API.
        orchestrator_model: Model ID used by the orchestrator for classification.
        default_model: Default model ID used by specialist agents.
    """

    anthropic_api_key: str
    orchestrator_model: str = "claude-sonnet-4-6"
    default_model: str = "claude-sonnet-4-6"
    # US federal capital gains tax defaults (user-overridable via frontend)
    short_term_tax_rate: float = 0.22
    long_term_tax_rate: float = 0.15

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Returns:
        The application settings, loaded once and cached for the process lifetime.
    """
    return Settings()  # type: ignore[call-arg]
