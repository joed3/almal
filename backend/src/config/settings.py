from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    anthropic_api_key: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
