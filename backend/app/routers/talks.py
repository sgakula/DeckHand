"""Phase 2/3 boundary: start a talk on a locked deck, stop it, enqueue the post-talk job.

The live audio path is in live.py; this router owns the talk lifecycle and a
text-transcript fallback endpoint (useful for demos without a mic).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.notetaker import take_notes
from ..deps import Uid
from ..firestore import (
    append_talk_data, get_talk, get_version, new_id, save_talk,
)
from ..pubsub import enqueue
from ..schemas import Job, Talk, now
from .presentations import _member

router = APIRouter(prefix="/presentations/{pid}/talks", tags=["talks"])


class TranscriptChunk(BaseModel):
    text: str
    current_slide_id: str = ""
    offset_seconds: float = 0.0


@router.post("/start")
async def start(pid: str, uid: str = Uid):
    p = _member(pid, uid)
    deck = get_version(pid, p.current_version)
    if deck is None or not deck.locked:
        raise HTTPException(409, "lock the deck before presenting")
    talk = Talk(id=new_id(), presentation_id=pid, version=deck.version)
    save_talk(talk)
    return {"talk_id": talk.id, "version": deck.version}


@router.post("/{tkid}/transcript")
async def push_transcript(pid: str, tkid: str, chunk: TranscriptChunk, uid: str = Uid):
    """Fallback path: client-side speech-to-text pushes transcript windows here."""
    p = _member(pid, uid)
    talk = get_talk(pid, tkid)
    if talk is None or talk.status != "live":
        raise HTTPException(409, "talk is not live")
    deck = get_version(pid, talk.version)
    assert deck is not None
    notes = await take_notes(uid, deck, p.outline, talk.notes, chunk.text,
                             chunk.current_slide_id, chunk.offset_seconds)
    append_talk_data(pid, tkid, chunk.text, [n.model_dump() for n in notes])
    return {"new_notes": notes}


@router.post("/{tkid}/stop")
async def stop(pid: str, tkid: str, uid: str = Uid):
    """Stop the talk and enqueue the asynchronous post-talk pipeline (Phase 3)."""
    p = _member(pid, uid)
    talk = get_talk(pid, tkid)
    if talk is None:
        raise HTTPException(404, "talk not found")
    talk.status = "stopped"
    talk.stopped_at = now()
    save_talk(talk)
    job = Job(id=new_id(), type="post_talk", uid=p.owner_uid,
              presentation_id=pid, version=talk.version, talk_id=tkid)
    enqueue(job)
    return {"job_id": job.id}


@router.get("/{tkid}")
async def get(pid: str, tkid: str, uid: str = Uid):
    _member(pid, uid)
    talk = get_talk(pid, tkid)
    if talk is None:
        raise HTTPException(404, "talk not found")
    return talk
