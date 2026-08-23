"""Build user-scoped Google Workspace API clients from the stored OAuth refresh token."""
from fastapi import HTTPException
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from .config import settings
from .firestore import get_google_tokens


def user_credentials(uid: str) -> Credentials:
    tokens = get_google_tokens(uid)
    if not tokens:
        raise HTTPException(428, "Google account not connected; call /auth/google/start first")
    s = settings()
    return Credentials(
        token=None,
        refresh_token=tokens["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=s.google_oauth_client_id,
        client_secret=s.google_oauth_client_secret,
        scopes=tokens.get("scopes"),
    )


def drive(uid: str):
    return build("drive", "v3", credentials=user_credentials(uid), cache_discovery=False)


def docs(uid: str):
    return build("docs", "v1", credentials=user_credentials(uid), cache_discovery=False)


def sheets(uid: str):
    return build("sheets", "v4", credentials=user_credentials(uid), cache_discovery=False)
