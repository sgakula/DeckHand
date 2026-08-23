"""Google OAuth consent flow for Workspace scopes (Drive, Slides, Gmail, Calendar, Tasks).

The refresh token is stored server-side in Firestore under users/{uid}/private/googleTokens.
Firestore security rules must deny all client access to the `private` subcollection.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow

from .config import WORKSPACE_SCOPES, settings
from .deps import Uid
from .firestore import get_google_tokens, save_google_tokens

router = APIRouter(prefix="/auth/google", tags=["auth"])


def _flow(state: str | None = None) -> Flow:
    # PKCE is disabled: /start and /callback run in different requests (and possibly
    # different instances), so a per-instance code_verifier would never match.
    # A confidential web client authenticates with its client_secret instead.
    s = settings()
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": s.google_oauth_client_id,
                "client_secret": s.google_oauth_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=WORKSPACE_SCOPES,
        state=state,
        redirect_uri=s.oauth_redirect_uri,
        autogenerate_code_verifier=False,
    )
    flow.code_verifier = None
    return flow


@router.get("/start")
async def start(uid: str = Uid):
    """Return the consent URL. Frontend opens it in a popup. `state` carries the uid."""
    url, _ = _flow(state=uid).authorization_url(
        access_type="offline", include_granted_scopes="true", prompt="consent"
    )
    return {"auth_url": url}


@router.get("/callback")
async def callback(code: str, state: str):
    """OAuth redirect target. `state` is the uid set in /start."""
    flow = _flow(state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        raise HTTPException(400, "no refresh token returned; remove prior grant and retry")
    save_google_tokens(state, {
        "refresh_token": creds.refresh_token,
        "client_id": settings().google_oauth_client_id,
        "scopes": list(creds.scopes or []),
    })
    return RedirectResponse(f"{settings().frontend_origin}/connected")


@router.get("/status")
async def status(uid: str = Uid):
    return {"connected": get_google_tokens(uid) is not None}
