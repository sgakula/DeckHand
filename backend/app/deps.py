"""FastAPI dependencies: authenticated user resolution via Firebase ID tokens."""
import re

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


_GUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,40}$")


async def current_uid(request: Request) -> str:
    """Resolve the caller's identity, in order of strength:

    1. `Authorization: Bearer <firebase-id-token>` - verified sign-in.
    2. `X-Guest-Id` header (when ALLOW_GUESTS) - invite-link teammates. The
       browser generates a stable random id; uid becomes "guest-<id>".
    3. DEV_FAKE_UID - local dev only, never set in prod.
    """
    s = settings()
    auth_header = request.headers.get("authorization", "")

    if not auth_header.lower().startswith("bearer "):
        guest = request.headers.get("x-guest-id", "")
        if s.allow_guests and _GUEST_ID_RE.match(guest):
            return f"guest-{guest}"
        if s.dev_fake_uid:
            return s.dev_fake_uid
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
