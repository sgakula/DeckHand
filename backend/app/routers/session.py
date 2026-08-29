"""The live session loop: an utterance goes in, the conductor decides, the
composer acts only if the group actually converged.

The whole product is this endpoint. Everything else is presentation.
"""
import asyncio
import logging
from collections import defaultdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.composer import compose
from ..agents.conductor import decide
from ..deps import Uid
from ..firestore import new_id
from ..schemas import now
from .. import tools
from ..workspaces import (
    FeedEvent, Note, Utterance, Workspace, WorkspaceKind, add_preference,
    create_workspace, get_preferences, get_workspace, list_workspaces, make_page,
    new_workspace, require_member, save_workspace,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
log = logging.getLogger(__name__)

# One writer per workspace at a time. A nudge click landing while a scripted
# utterance is mid-flight must queue, not clobber the read-modify-write.
_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


class CreateReq(BaseModel):
    title: str = "Untitled"
    kind: WorkspaceKind = "presentation"


class TranscribeReq(BaseModel):
    #: base64 of raw 16 kHz mono PCM16 audio
    pcm_base64: str


class UtteranceReq(BaseModel):
    speaker: str
    text: str


class AnswerReq(BaseModel):
    """A human resolving the one question the agent was blocked on."""
    choice: str


class RateReq(BaseModel):
    """Thumbs on one agent action. A thumbs-down is how the agent learns."""
    event_id: str
    rating: str  # "up" | "down"
    note: str = ""


class StepReq(BaseModel):
    accept: bool


def _member(wid: str, uid: str) -> Workspace:
    try:
        return require_member(wid, uid)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc


@router.post("")
async def create(req: CreateReq, uid: str = Uid):
    w = new_workspace(uid, req.title, req.kind)
    create_workspace(w)
    return w


@router.get("")
async def index(uid: str = Uid):
    return list_workspaces(uid)


@router.get("/{wid}")
async def get(wid: str, uid: str = Uid):
    return _member(wid, uid)


@router.post("/{wid}/join")
async def join(wid: str, uid: str = Uid):
    """Join by invite link: anyone who has the workspace URL becomes a member.

    Deliberate for the collaborative session - the link IS the invite. Idempotent.
    """
    w = get_workspace(wid)
    if w is None:
        raise HTTPException(404, "workspace not found")
    if uid not in w.member_uids and uid != w.owner_uid:
        w.member_uids.append(uid)
        save_workspace(w)
    return w


@router.post("/{wid}/transcribe")
async def transcribe(wid: str, req: TranscribeReq, uid: str = Uid):
    """Mic fallback for browsers whose SpeechRecognition is a stub (Brave):
    the client ships raw PCM windows; we transcribe with the main model."""
    import base64

    from ..transcribe import transcribe_pcm
    _member(wid, uid)
    try:
        pcm = base64.b64decode(req.pcm_base64)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "bad audio payload") from exc
    if len(pcm) > 4_000_000:   # ~2 minutes; windows should be far smaller
        raise HTTPException(413, "audio window too large")
    return {"text": await transcribe_pcm(pcm)}


@router.post("/{wid}/utterance")
async def utterance(wid: str, req: UtteranceReq, uid: str = Uid):
    """One turn of the conversation. Returns what the agent decided and why."""
    async with _locks[wid]:
        return await _utterance(wid, req, uid)


async def _utterance(wid: str, req: UtteranceReq, uid: str):
    w = _member(wid, uid)

    turn = Utterance(id=new_id(), speaker=req.speaker, text=req.text)
    w.transcript.append(turn)
    w.events.append(
        FeedEvent(id=new_id(), kind="speech", speaker=req.speaker, text=req.text)
    )

    # A pending question blocks edits: the agent asked the group something and
    # acting before they answer is exactly the guessing we are trying to avoid.
    if w.pending_question is not None:
        save_workspace(w)
        return {"decision": "hold", "reason": "waiting on your answer", "workspace": w}

    # A model outage must not end the session. Holding is always a safe answer,
    # and the group keeps talking while the next turn retries.
    try:
        decision = await decide(
            uid,
            [t.model_dump() for t in w.transcript],
            [p.model_dump() for p in w.pages],
            w.facts,
            [e.text for e in w.events if e.kind == "asked"],
            get_preferences(w.owner_uid),
            w.declined_steps,
            recent_actions=[e.text for e in reversed(w.events)
                            if e.kind == "acted" and e.text][:6],
        )
    except Exception:  # noqa: BLE001
        # Degrading is fine; degrading silently is not — this has to be diagnosable.
        log.exception("conductor failed for workspace %s", w.id)
        w.events.append(
            FeedEvent(id=new_id(), kind="held", reason="lost the thread for a second")
        )
        save_workspace(w)
        return {"decision": "hold", "reason": "lost the thread for a second",
                "degraded": True, "workspace": w}

    _record_notes(w, decision)
    w.next_step = decision.next_step or ""

    instruction = decision.instruction
    image_url = ""
    if decision.tool.name:
        # Off the event loop: a real tool (or image generation) can take long
        # enough that keeping the API responsive matters mid-session.
        # Tools act as whoever in the room has a Google account connected, so a
        # guest's question still reads the owner's real Drive.
        from ..integrations import tool_uid
        acting_uid = tool_uid(uid, w.owner_uid, w.member_uids)
        result = await asyncio.to_thread(
            tools.execute, decision.tool.name, tools.args_for(decision.tool), acting_uid,
            {"pages": [p.model_dump() for p in w.pages], "title": w.title},
        )
        if result is not None:
            # Tool output becomes citable, so the composer can source from it.
            known = {(f.fact, f.source_ref) for f in w.facts}
            w.facts.extend(
                f for f in result.facts if (f.fact, f.source_ref) not in known
            )
            w.events.append(
                FeedEvent(id=new_id(), kind="acted", reason="used a tool",
                          text=result.summary, tool=decision.tool.name,
                          link=(result.data or {}).get("url", ""),
                          link_label=(result.data or {}).get("link_label", ""))
            )
            image_url = (result.data or {}).get("image_url", "")

    if decision.action == "hold":
        w.events.append(
            FeedEvent(id=new_id(), kind="held", reason=decision.reason or "listening")
        )
        save_workspace(w)
        return {"decision": "hold", "reason": decision.reason, "workspace": w}

    if decision.action == "ask":
        ask = FeedEvent(
            id=new_id(),
            kind="asked",
            text=decision.question,
            reason=decision.reason,
            options=decision.options,
            page_id=decision.target_page_id,
        )
        w.events.append(ask)
        w.pending_question = ask
        save_workspace(w)
        return {"decision": "ask", "question": decision.question,
                "options": decision.options, "workspace": w}

    target_page = decision.target_page_id
    if decision.new_page_label and not any(
        p.label.lower() == decision.new_page_label.lower() for p in w.pages
    ):
        page = make_page(decision.new_page_label, len(w.pages))
        w.pages.append(page)
        target_page = page.id

    # The composer needs the image URL; the humans in the feed do not.
    composed = instruction
    if image_url and decision.action == "act":
        composed += (
            f"\n\nA generated image for this page is available at: {image_url}"
            "\nEmbed it with an <img> tag where it strengthens the page."
        )
    return await _apply(w, uid, target_page, composed,
                        decision.reason, [turn.id], shown=instruction)


def _pick_page(w: Workspace, text: str) -> str:
    """Best page for an instruction with no explicit target: a label mentioned in
    the text, else the first still-empty page, else the first page."""
    lowered = text.lower()
    for p in w.pages:
        if p.label.lower() in lowered:
            return p.id
    for p in w.pages:
        if p.is_placeholder:
            return p.id
    return w.pages[0].id if w.pages else ""


def _record_notes(w: Workspace, decision) -> None:
    """Persist notes, and promote preferences so they outlive this session."""
    for note in decision.notes:
        if any(n.text == note.text for n in w.notes):
            continue
        w.notes.append(
            Note(id=new_id(), kind=note.kind, text=note.text, owner=note.owner)
        )
        if note.kind == "preference":
            add_preference(w.owner_uid, note.text)


@router.post("/{wid}/answer")
async def answer(wid: str, req: AnswerReq, uid: str = Uid):
    """Resolve the blocking question and immediately act on the answer."""
    async with _locks[wid]:
        return await _answer(wid, req, uid)


async def _answer(wid: str, req: AnswerReq, uid: str):
    w = _member(wid, uid)
    if w.pending_question is None:
        raise HTTPException(409, "nothing to answer")

    question = w.pending_question
    w.pending_question = None
    w.events.append(
        FeedEvent(id=new_id(), kind="answered", speaker=uid, text=req.choice,
                  reason=question.text)
    )
    w.transcript.append(
        Utterance(id=new_id(), speaker="You", text=f"{question.text} — {req.choice}")
    )

    # The answer is itself the instruction; no need to re-run the conductor.
    target = question.page_id or _pick_page(w, f"{question.text} {req.choice}")
    return await _apply(w, uid, target, f"{question.text} The group chose: {req.choice}",
                        "you answered", [w.transcript[-1].id])


async def _apply(
    w: Workspace, uid: str, page_id: str, instruction: str, reason: str,
    from_utterances: list[str], shown: str | None = None,
):
    """Run the composer against one page and record what changed and why."""
    page = next((p for p in w.pages if p.id == page_id), None) or (w.pages[0] if w.pages else None)
    if page is None:
        raise HTTPException(409, "workspace has no pages")

    # Same reasoning as the conductor: a failed compose leaves the page as it was
    # and the group carries on talking, rather than the session throwing at them.
    try:
        result = await compose(uid, page.label, page.body, instruction, w.facts, w.kind,
                               is_placeholder=page.is_placeholder)
    except Exception:  # noqa: BLE001
        log.exception("composer failed for workspace %s page %s", w.id, page.id)
        w.events.append(
            FeedEvent(id=new_id(), kind="held", reason="could not draft that just now",
                      page_id=page.id)
        )
        save_workspace(w)
        return {"decision": "hold", "reason": "could not draft that just now",
                "degraded": True, "workspace": w}

    page.body = result.html
    page.is_placeholder = False
    page.updated_at = now()
    page.caused_by = from_utterances
    page.unsourced = [
        f"{c.text}{f': {c.value}' if c.value else ''}" for c in result.claims if not c.source_ref
    ]
    # Labels are filmstrip captions: short or not at all.
    if result.label and len(result.label) <= 24:
        page.label = result.label

    w.events.append(
        FeedEvent(
            id=new_id(),
            kind="acted",
            reason=reason,
            text=shown or instruction,
            page_id=page.id,
            from_utterances=from_utterances,
        )
    )
    save_workspace(w)
    return {
        "decision": "act",
        "page_id": page.id,
        "unsourced": page.unsourced,
        "workspace": w,
    }


@router.post("/{wid}/rate")
async def rate(wid: str, req: RateReq, uid: str = Uid):
    """Thumbs on an agent action.

    A thumbs-down with a note is the strongest learning signal in the product:
    it becomes a durable preference, so the same mistake is not repeated in the
    next session.
    """
    w = _member(wid, uid)
    event = next((e for e in w.events if e.id == req.event_id), None)
    if event is None:
        raise HTTPException(404, "no such event")

    event.rating = "up" if req.rating == "up" else "down"
    if req.note:
        w.notes.append(Note(id=new_id(), kind="preference", text=req.note))
        add_preference(w.owner_uid, req.note)
    save_workspace(w)
    return {"ok": True, "preferences": get_preferences(w.owner_uid)}


@router.post("/{wid}/next-step")
async def next_step(wid: str, req: StepReq, uid: str = Uid):
    """Accept or decline the agent's suggestion.

    Declining is remembered so it stops re-offering the same thing — the
    difference between a guide and a nag.
    """
    async with _locks[wid]:
        return await _next_step(wid, req, uid)


async def _next_step(wid: str, req: StepReq, uid: str):
    w = _member(wid, uid)
    suggestion = w.next_step
    if not suggestion:
        raise HTTPException(409, "no suggestion pending")
    w.next_step = ""

    if not req.accept:
        w.declined_steps.append(suggestion)
        save_workspace(w)
        return {"decision": "hold", "reason": "noted", "workspace": w}

    w.transcript.append(Utterance(id=new_id(), speaker="You", text=f"Yes — {suggestion}"))
    return await _apply(w, uid, _pick_page(w, suggestion), suggestion,
                        "you accepted the suggestion", [w.transcript[-1].id])


@router.get("/{wid}/notes")
async def notes(wid: str, uid: str = Uid):
    w = _member(wid, uid)
    return {"notes": w.notes, "preferences": get_preferences(w.owner_uid)}
