"""Real Google Workspace implementations for the session tools.

Each function assumes the user completed the OAuth consent flow (app/oauth.py).
tools.py calls these when `is_connected(uid)` is true and falls back to the
local simulated versions otherwise — so the app works in both modes and the
tool summaries stay honest about which one ran.
"""
import io
import logging
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

from .firestore import get_google_tokens
from .google_apis import drive
from .schemas import SourceFact

log = logging.getLogger(__name__)

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
GSHEET_MIME = "application/vnd.google-apps.spreadsheet"
GSLIDES_MIME = "application/vnd.google-apps.presentation"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def tool_uid(caller_uid: str, owner_uid: str, member_uids: list[str]) -> str:
    """The identity tools should act as: the first person in the room with a
    connected Google account (caller preferred, then owner, then any member).
    The room shares one set of integrations, whoever happens to be speaking."""
    seen: set[str] = set()
    for uid in [caller_uid, owner_uid, *member_uids]:
        if uid and uid not in seen:
            seen.add(uid)
            if is_connected(uid):
                return uid
    return caller_uid


def is_connected(uid: str) -> bool:
    try:
        return bool(uid) and get_google_tokens(uid) is not None
    except Exception:  # noqa: BLE001 - a broken store must not sink a tool call
        return False


def _service(uid: str, name: str, version: str):
    from googleapiclient.discovery import build

    from .google_apis import user_credentials
    return build(name, version, credentials=user_credentials(uid), cache_discovery=False)


# ------------------------------------------------------------------ drive read

def drive_read(uid: str, hint: str) -> tuple[str, list[SourceFact]]:
    """Find the best-matching spreadsheet in the user's real Drive and parse it
    with the same cell-level parser the demo folder uses. Returns ("", []) when
    nothing matches — the caller then falls back to the demo folder."""
    svc = drive(uid)
    safe_hint = (hint or "").replace("'", " ").strip()
    query = (
        f"(mimeType='{GSHEET_MIME}' or mimeType='{XLSX_MIME}') and trashed=false"
        + (f" and name contains '{safe_hint}'" if safe_hint else "")
    )
    files = (svc.files().list(q=query, pageSize=5, orderBy="modifiedTime desc",
                              fields="files(id,name,mimeType)").execute()
             .get("files", []))
    if not files and safe_hint:   # retry without the name filter, match loosely
        files = (svc.files().list(
            q=f"(mimeType='{GSHEET_MIME}' or mimeType='{XLSX_MIME}') and trashed=false",
            pageSize=10, orderBy="modifiedTime desc",
            fields="files(id,name,mimeType)").execute().get("files", []))
        tokens = [t for t in safe_hint.lower().split() if len(t) > 2]
        # A file must actually match the hint. Grabbing "most recent" instead
        # poured unrelated data into the session's facts - never do that.
        files = [f for f in files if any(t in f["name"].lower() for t in tokens)]
    if not files:
        return "", []
    f = files[0]

    buf = io.BytesIO()
    if f["mimeType"] == GSHEET_MIME:
        request = svc.files().export_media(fileId=f["id"], mimeType=XLSX_MIME)
    else:
        request = svc.files().get_media(fileId=f["id"])
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    from . import demo_drive
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(buf.getvalue())
        tmp_path = Path(tmp.name)
    try:
        facts = demo_drive._read_xlsx(tmp_path)  # same parser, real transport
    finally:
        tmp_path.unlink(missing_ok=True)
    for fact in facts:
        fact.source_doc = f["name"]
        # The parser cites the temp file's name; swap in the real one.
        fact.source_ref = fact.source_ref.replace(tmp_path.name, f["name"])
    return f["name"], facts


# ------------------------------------------------------------------ gmail

def gmail_draft(uid: str, to: list[str], subject: str, body: str) -> str:
    """Create a real draft in the user's Gmail. Returns the draft's web URL."""
    import base64
    from email.message import EmailMessage

    msg = EmailMessage()
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject or "Follow-up"
    msg.set_content(body or "")
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    svc = _service(uid, "gmail", "v1")
    draft = svc.users().drafts().create(
        userId="me", body={"message": {"raw": raw}}).execute()
    return f"https://mail.google.com/mail/#drafts?compose={draft['message']['id']}"


# ------------------------------------------------------------------ calendar

def calendar_hold(uid: str, title: str, attendees: list[str],
                  start: datetime, minutes: int = 30) -> str:
    """Insert a real Calendar event. Returns the event's htmlLink."""
    svc = _service(uid, "calendar", "v3")
    body = {
        "summary": title or "Working session",
        "description": "Held by Deckhand.",
        "start": {"dateTime": start.isoformat(),
                  "timeZone": "UTC" if start.tzinfo else "Asia/Kolkata"},
        "end": {"dateTime": (start + timedelta(minutes=minutes)).isoformat(),
                "timeZone": "UTC" if start.tzinfo else "Asia/Kolkata"},
        "attendees": [{"email": a} for a in attendees if "@" in a],
    }
    event = svc.events().insert(calendarId="primary", body=body).execute()
    return event.get("htmlLink", "")


# ------------------------------------------------------------------ slides

def upload_pptx_as_slides(uid: str, pptx_path: Path, title: str) -> tuple[str, str]:
    """Upload the built .pptx to Drive converted to Google Slides.
    Returns (file_id, web_link)."""
    svc = drive(uid)
    media = MediaFileUpload(str(pptx_path), mimetype=PPTX_MIME, resumable=False)
    f = svc.files().create(
        body={"name": title or "Deckhand deck", "mimeType": GSLIDES_MIME},
        media_body=media, fields="id,webViewLink").execute()
    return f["id"], f.get("webViewLink",
                          f"https://docs.google.com/presentation/d/{f['id']}")
