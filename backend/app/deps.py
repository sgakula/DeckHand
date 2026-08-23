"""FastAPI dependencies: authenticated user resolution via Firebase ID tokens."""
from fastapi import Depends, HTTPException, Request

from .config import settings

_firebase_ready = False


def _init_firebase() -> None:
    global _firebase_ready
    if not _firebase_ready:
        import firebase_admin
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        _firebase_ready = True


async def current_uid(request: Request) -> str:
    """Resolve the caller's uid from `Authorization: Bearer <firebase-id-token>`.

    Local dev: set DEV_FAKE_UID to bypass verification (never in prod).
    """
    s = settings()
    if s.dev_fake_uid:
        return s.dev_fake_uid

    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    token = auth_header.split(" ", 1)[1]
    try:
        _init_firebase()
        from firebase_admin import auth as fb_auth
        decoded = fb_auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(401, f"invalid token: {exc}") from exc


Uid = Depends(current_uid)
