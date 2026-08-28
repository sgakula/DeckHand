"""Central configuration, loaded from environment (.env locally, env vars on Cloud Run)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_cloud_project: str = ""
    google_cloud_location: str = "us-central1"
    google_genai_use_vertexai: bool = True
    google_api_key: str = ""

    gemini_model: str = "gemini-3.5-flash"
    # Tried in order when the primary is out of quota. Free-tier per-day limits
    # are low enough that a single-model demo can die mid-session.
    gemini_fallback_models: str = "gemini-3.6-flash,gemini-2.5-flash,gemini-3.1-flash-lite"
    gemini_live_model: str = "gemini-3.5-flash-live"
    image_model: str = "gemini-3.1-flash-image"
    transcribe_model: str = "gemini-3.5-transcribe"

    google_search_api_key: str = ""
    pubsub_topic: str = "deckhand-jobs"
    gcs_bucket: str = ""

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:8080/auth/google/callback"

    frontend_origin: str = "http://localhost:3000"
    dev_fake_uid: str = ""
    enable_tracing: bool = False

    # Local dev only: swap Firestore/Pub/Sub for on-disk stand-ins so the stack runs
    # without Application Default Credentials. NEVER set these in prod.
    local_store: bool = False
    local_store_path: str = ".localstore.json"
    worker_url: str = ""        # local Pub/Sub stand-in posts job envelopes here


@lru_cache
def settings() -> Settings:
    s = Settings()
    # ADK and the GenAI SDK build their own clients from os.environ; pydantic's
    # .env loading doesn't populate that, so export the values once here.
    import os
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", s.google_cloud_project)
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", s.google_cloud_location)
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI",
                          "true" if s.google_genai_use_vertexai else "false")
    if s.google_api_key:
        os.environ.setdefault("GOOGLE_API_KEY", s.google_api_key)
    return s


# OAuth scopes the app asks the user to consent to (incremental auth is fine too).
WORKSPACE_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
]
