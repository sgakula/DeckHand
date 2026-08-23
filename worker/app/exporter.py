"""Step a (Phase 3): convert the locked deck into a real Google Slides file,
plus PDF and PPTX copies in Cloud Storage."""
import io

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.cloud import storage

from .config import settings
from .google_apis import user_credentials
from .schemas import DeckVersion, Slide

BODY_TEXT_KINDS = {"text", "bullet", "quote"}



def _signed_or_direct_url(blob) -> str:
    """Signed URL in prod (service account can sign); authenticated URL fallback locally."""
    try:
        return blob.generate_signed_url(version="v4", expiration=7 * 24 * 3600)
    except Exception:
        return f"https://storage.cloud.google.com/{blob.bucket.name}/{blob.name}"

def _slides_service(uid: str):
    return build("slides", "v1", credentials=user_credentials(uid), cache_discovery=False)


def _drive_service(uid: str):
    return build("drive", "v3", credentials=user_credentials(uid), cache_discovery=False)


def _slide_body_text(slide: Slide) -> str:
    lines = []
    for b in slide.blocks:
        if b.kind in BODY_TEXT_KINDS:
            lines.append(f"- {b.text}" if b.kind == "bullet" else b.text)
        elif b.kind == "metric":
            src = f"  [{b.source_ref}]" if b.source_ref else ""
            lines.append(f"{b.text}: {b.value}{src}")
    return "\n".join(lines)


def export_to_slides(uid: str, title: str, deck: DeckVersion) -> str:
    """Create the Slides file; returns its file id. Idempotent per job via steps_done."""
    svc = _slides_service(uid)
    pres = svc.presentations().create(body={"title": f"{title} (v{deck.version})"}).execute()
    file_id = pres["presentationId"]

    requests = []
    for i, slide in enumerate(sorted(deck.slides, key=lambda s: s.order)):
        sid = f"slide{i:03d}"   # Slides API: object ids must be >= 5 chars
        requests.append({"createSlide": {
            "objectId": sid, "insertionIndex": i,
            "slideLayoutReference": {"predefinedLayout": "TITLE_AND_BODY"},
            "placeholderIdMappings": [
                {"layoutPlaceholder": {"type": "TITLE"}, "objectId": f"{sid}title"},
                {"layoutPlaceholder": {"type": "BODY"}, "objectId": f"{sid}body"},
            ]}})
        requests.append({"insertText": {"objectId": f"{sid}title", "text": slide.title or " "}})
        body = _slide_body_text(slide)
        if body:
            requests.append({"insertText": {"objectId": f"{sid}body", "text": body}})
        if slide.image_url:
            requests.append({"createImage": {
                "url": slide.image_url,
                "elementProperties": {"pageObjectId": sid}}})
        if slide.speaker_notes:
            # Speaker notes need the notes page shape id; fetched after creation below.
            pass

    # Remove the default empty first slide.
    first = pres["slides"][0]["objectId"] if pres.get("slides") else None
    if first:
        requests.append({"deleteObject": {"objectId": first}})

    svc.presentations().batchUpdate(
        presentationId=file_id, body={"requests": requests}).execute()

    # Second pass: speaker notes (needs the generated notes shape ids).
    doc = svc.presentations().get(presentationId=file_id).execute()
    notes_reqs = []
    ordered = sorted(deck.slides, key=lambda s: s.order)
    for page, slide in zip(doc.get("slides", []), ordered):
        if not slide.speaker_notes:
            continue
        notes_id = (page.get("slideProperties", {})
                    .get("notesPage", {}).get("notesProperties", {})
                    .get("speakerNotesObjectId"))
        if notes_id:
            notes_reqs.append({"insertText": {"objectId": notes_id,
                                              "text": slide.speaker_notes}})
    if notes_reqs:
        svc.presentations().batchUpdate(
            presentationId=file_id, body={"requests": notes_reqs}).execute()
    return file_id


def export_file_copies(uid: str, file_id: str, pid: str, version: int) -> tuple[str, str]:
    """Export PDF + PPTX via Drive and store in GCS; returns signed URLs."""
    drive = _drive_service(uid)
    bucket = storage.Client(project=settings().google_cloud_project or None).bucket(settings().gcs_bucket)
    urls = []
    for mime, ext in [
        ("application/pdf", "pdf"),
        ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"),
    ]:
        buf = io.BytesIO()
        req = drive.files().export_media(fileId=file_id, mimeType=mime)
        downloader = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        blob = bucket.blob(f"exports/{pid}/v{version}.{ext}")
        blob.upload_from_string(buf.getvalue(), content_type=mime)
        urls.append(_signed_or_direct_url(blob))
    return urls[0], urls[1]
