"""Thin repository layer over Firestore. All document IO goes through here."""
import uuid
from typing import Optional

from google.cloud import firestore

from .config import settings
from .schemas import (
    DeckVersion, Job, Presentation, PreferenceProfile, Talk, now,
)

_db: Optional[firestore.Client] = None


def db() -> firestore.Client:
    global _db
    if _db is None:
        s = settings()
        if s.local_store:
            from .localstore import LocalClient
            _db = LocalClient(s.local_store_path)
        else:
            # Explicit project: .env values live in Settings, not os.environ, so the
            # client must not fall back to the ADC default project.
            _db = firestore.Client(project=s.google_cloud_project or None)
    return _db


def _data(snap) -> dict:
    return snap.to_dict() or {}


def new_id() -> str:
    return uuid.uuid4().hex[:12]


# ---------- users ----------

def get_profile(uid: str) -> PreferenceProfile:
    snap = db().document(f"users/{uid}/meta/profile").get()
    return PreferenceProfile(**_data(snap)) if snap.exists else PreferenceProfile()


def save_profile(uid: str, profile: PreferenceProfile) -> None:
    profile.updated_at = now()
    db().document(f"users/{uid}/meta/profile").set(profile.model_dump())


def save_google_tokens(uid: str, tokens: dict) -> None:
    db().document(f"users/{uid}/private/googleTokens").set(tokens)


def get_google_tokens(uid: str) -> Optional[dict]:
    snap = db().document(f"users/{uid}/private/googleTokens").get()
    return _data(snap) if snap.exists else None


# ---------- presentations ----------

def create_presentation(p: Presentation) -> None:
    db().document(f"presentations/{p.id}").set(p.model_dump())


def get_presentation(pid: str) -> Optional[Presentation]:
    snap = db().document(f"presentations/{pid}").get()
    return Presentation(**_data(snap)) if snap.exists else None


def save_presentation(p: Presentation) -> None:
    db().document(f"presentations/{p.id}").set(p.model_dump())


def list_presentations(uid: str) -> list[Presentation]:
    q = db().collection("presentations").where("member_uids", "array_contains", uid)
    return [Presentation(**_data(s)) for s in q.stream()]


def require_member(pid: str, uid: str) -> Presentation:
    p = get_presentation(pid)
    if p is None:
        raise LookupError("presentation not found")
    if uid not in p.member_uids and uid != p.owner_uid:
        raise PermissionError("not a member of this presentation")
    return p


# ---------- versions ----------

def get_version(pid: str, version: int) -> Optional[DeckVersion]:
    snap = db().document(f"presentations/{pid}/versions/{version}").get()
    return DeckVersion(**_data(snap)) if snap.exists else None


def save_version(pid: str, v: DeckVersion) -> None:
    db().document(f"presentations/{pid}/versions/{v.version}").set(v.model_dump())


def list_versions(pid: str) -> list[DeckVersion]:
    col = db().collection(f"presentations/{pid}/versions").stream()
    return sorted((DeckVersion(**_data(s)) for s in col), key=lambda v: v.version)


# ---------- build sessions (interview + builder chat, teammate edits/comments) ----------

def append_build_event(pid: str, bsid: str, event: dict) -> None:
    event["at"] = now()
    db().collection(f"presentations/{pid}/buildSessions/{bsid}/events").add(event)


def get_build_events(pid: str, bsid: str, limit: int = 200) -> list[dict]:
    q = (db().collection(f"presentations/{pid}/buildSessions/{bsid}/events")
         .order_by("at").limit(limit))
    return [_data(s) for s in q.stream()]


# ---------- talks ----------

def save_talk(t: Talk) -> None:
    db().document(f"presentations/{t.presentation_id}/talks/{t.id}").set(t.model_dump())


def list_talks(pid: str) -> list[Talk]:
    col = db().collection(f"presentations/{pid}/talks").stream()
    return sorted((Talk(**_data(s)) for s in col), key=lambda t: t.started_at, reverse=True)


def get_talk(pid: str, tkid: str) -> Optional[Talk]:
    snap = db().document(f"presentations/{pid}/talks/{tkid}").get()
    return Talk(**_data(snap)) if snap.exists else None


def append_talk_data(pid: str, tkid: str, transcript_chunk: str | None, notes: list[dict]) -> None:
    ref = db().document(f"presentations/{pid}/talks/{tkid}")
    updates: dict = {}
    if transcript_chunk:
        updates["transcript"] = firestore.ArrayUnion([transcript_chunk])
    if notes:
        updates["notes"] = firestore.ArrayUnion(notes)
    if updates:
        ref.update(updates)


# ---------- jobs ----------

def save_job(job: Job) -> None:
    db().document(f"jobs/{job.id}").set(job.model_dump())


def get_job(job_id: str) -> Optional[Job]:
    snap = db().document(f"jobs/{job_id}").get()
    return Job(**_data(snap)) if snap.exists else None
