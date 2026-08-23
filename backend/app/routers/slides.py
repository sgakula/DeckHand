"""Phase 1b: slide building, edits (text/voice/comment), approval, dry-run, Lock Deck."""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from ..agents.builder import apply_edit, dry_run_check, generate_section_slides
from ..agents.images import generate_slide_image
from ..deps import Uid
from ..firestore import (
    append_build_event, get_presentation, get_profile, get_version, new_id,
    save_presentation, save_version,
)
from ..pubsub import enqueue
from ..schemas import DeckVersion, Job, now
from .interview import BUILD_SESSION
from .presentations import _member

router = APIRouter(prefix="/presentations/{pid}/deck", tags=["slides"])


class EditReq(BaseModel):
    slide_id: str
    request_text: str          # voice transcript, typed command, or teammate comment
    source: str = "text"       # text | voice | comment


class ReorderReq(BaseModel):
    slide_ids_in_order: list[str]


def _working_version(pid: str) -> DeckVersion:
    """The current unlocked draft version (create v1 lazily)."""
    p = get_presentation(pid)
    assert p is not None
    v = get_version(pid, p.current_version) if p.current_version else None
    if v is None or v.locked:
        v = DeckVersion(version=(p.current_version + 1), slides=(v.slides if v else []),
                        parent_version=(p.current_version or None))
        p.current_version = v.version
        save_version(pid, v)
        save_presentation(p)
    return v


@router.post("/build/{section_id}")
async def build_section(pid: str, section_id: str, bg: BackgroundTasks, uid: str = Uid):
    """Generate slides for one outline section and kick off async imagery."""
    p = _member(pid, uid)
    if not p.outline.approved:
        raise HTTPException(409, "approve the outline first")
    section = next((s for s in p.outline.sections if s.id == section_id), None)
    if section is None:
        raise HTTPException(404, "unknown section")

    deck = _working_version(pid)
    deck.slides = [s for s in deck.slides if s.section_id != section_id]  # rebuild is idempotent
    new_slides = await generate_section_slides(
        uid, p.brief, section, get_profile(p.owner_uid), start_order=len(deck.slides))
    deck.slides.extend(new_slides)
    deck.slides.sort(key=lambda s: s.order)
    save_version(pid, deck)

    for s in new_slides:                       # async Nano Banana with stale guard
        if s.image_prompt:
            bg.add_task(generate_slide_image, pid, deck.version, s.id, s.image_rev)

    append_build_event(pid, BUILD_SESSION, {"channel": "builder", "role": "agent",
                                            "text": f"built section {section_id}"})
    return {"version": deck.version, "slides": new_slides}


@router.post("/edit")
async def edit(pid: str, req: EditReq, bg: BackgroundTasks, uid: str = Uid):
    """Apply one conversational edit. May return a clarifying question instead."""
    p = _member(pid, uid)
    deck = _working_version(pid)
    slide = next((s for s in deck.slides if s.id == req.slide_id), None)
    if slide is None:
        raise HTTPException(404, "unknown slide")

    result = await apply_edit(uid, slide, req.request_text, p.outline, get_profile(p.owner_uid))

    if result.clarifying_question:
        append_build_event(pid, BUILD_SESSION, {
            "channel": "builder", "role": "agent", "kind": "clarify",
            "slide_id": req.slide_id, "text": result.clarifying_question})
        return {"clarifying_question": result.clarifying_question}

    deck.slides = [result.slide if s.id == slide.id else s for s in deck.slides]
    save_version(pid, deck)
    if result.slide.image_prompt:
        bg.add_task(generate_slide_image, pid, deck.version, result.slide.id,
                    result.slide.image_rev)

    # Build-time feedback stream (Phase 4 input): record every accepted change.
    append_build_event(pid, BUILD_SESSION, {
        "channel": "builder", "role": "agent", "kind": "edit",
        "uid": uid, "source": req.source, "slide_id": req.slide_id,
        "request": req.request_text, "change": result.change_summary})
    return {"slide": result.slide, "change_summary": result.change_summary}


@router.post("/reorder")
async def reorder(pid: str, req: ReorderReq, uid: str = Uid):
    _member(pid, uid)
    deck = _working_version(pid)
    order = {sid: i for i, sid in enumerate(req.slide_ids_in_order)}
    for s in deck.slides:
        s.order = order.get(s.id, s.order)
    deck.slides.sort(key=lambda s: s.order)
    save_version(pid, deck)
    return {"ok": True}


@router.post("/slides/{slide_id}/approve")
async def approve_slide(pid: str, slide_id: str, uid: str = Uid):
    p = _member(pid, uid)
    if uid != p.owner_uid:
        raise HTTPException(403, "only the presenter approves slides")
    deck = _working_version(pid)
    slide = next((s for s in deck.slides if s.id == slide_id), None)
    if slide is None:
        raise HTTPException(404, "unknown slide")
    slide.approved = True
    save_version(pid, deck)
    return {"ok": True}


@router.get("/dry-run")
async def dry_run(pid: str, uid: str = Uid):
    p = _member(pid, uid)
    deck = _working_version(pid)
    return dry_run_check(p.brief, p.outline, deck.slides)


@router.post("/lock")
async def lock(pid: str, uid: str = Uid):
    """Lock Deck: immutable version N; also enqueue an early Slides export as backup."""
    p = _member(pid, uid)
    if uid != p.owner_uid:
        raise HTTPException(403, "only the presenter locks the deck")
    deck = _working_version(pid)
    check = dry_run_check(p.brief, p.outline, deck.slides)
    if not check["ready"]:
        raise HTTPException(409, {"message": "deck not ready", **check})
    deck.locked = True
    deck.locked_at = now()
    save_version(pid, deck)
    append_build_event(pid, BUILD_SESSION, {"channel": "builder", "role": "user",
                                            "uid": uid, "text": f"LOCKED v{deck.version}"})
    job = Job(id=new_id(), type="export_deck", uid=p.owner_uid,
              presentation_id=pid, version=deck.version)
    enqueue(job)
    return {"version": deck.version, "export_job": job.id}


@router.get("")
async def get_deck(pid: str, uid: str = Uid):
    _member(pid, uid)
    return _working_version(pid)
