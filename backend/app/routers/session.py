"""The live session loop: an utterance goes in, the conductor decides, the
composer acts only if the group actually converged.

The whole product is this endpoint. Everything else is presentation.
"""
import logging

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
    create_workspace, get_preferences, list_workspaces, new_workspace,
    require_member, save_workspace,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
log = logging.getLogger(__name__)


class CreateReq(BaseModel):
    title: str = "Untitled"
    kind: WorkspaceKind = "presentation"


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


@router.post("/{wid}/utterance")
async def utterance(wid: str, req: UtteranceReq, uid: str = Uid):
    """One turn of the conversation. Returns what the agent decided and why."""
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

    tool_facts: list = []
    if decision.tool.name:
        result = tools.execute(decision.tool.name, tools.args_for(decision.tool), uid)
        if result is not None:
            tool_facts = result.facts
            # Tool output becomes citable, so the composer can source from it.
            w.facts.extend(result.facts)
            w.events.append(
                FeedEvent(id=new_id(), kind="acted", reason="used a tool",
                          text=result.summary, tool=decision.tool.name)
            )

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
        )
        w.events.append(ask)
        w.pending_question = ask
        save_workspace(w)
        return {"decision": "ask", "question": decision.question,
                "options": decision.options, "workspace": w}

    return await _apply(w, uid, decision.target_page_id, decision.instruction,
                        decision.reason, [turn.id])


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
        Utterance(id=new_id(), speaker=uid, text=f"{question.text} — {req.choice}")
    )

    # The answer is itself the instruction; no need to re-run the conductor.
    target = question.page_id or (w.pages[0].id if w.pages else "")
    return await _apply(w, uid, target, f"{question.text} The group chose: {req.choice}",
                        "you answered", [w.transcript[-1].id])


async def _apply(
    w: Workspace, uid: str, page_id: str, instruction: str, reason: str,
    from_utterances: list[str],
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
    if result.label:
        page.label = result.label

    w.events.append(
        FeedEvent(
            id=new_id(),
            kind="acted",
            reason=reason,
            text=instruction,
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
    w = _member(wid, uid)
    suggestion = w.next_step
    if not suggestion:
        raise HTTPException(409, "no suggestion pending")
    w.next_step = ""

    if not req.accept:
        w.declined_steps.append(suggestion)
        save_workspace(w)
        return {"decision": "hold", "reason": "noted", "workspace": w}

    w.transcript.append(Utterance(id=new_id(), speaker=uid, text=f"Yes — {suggestion}"))
    return await _apply(w, uid, w.pages[0].id, suggestion, "you accepted the suggestion",
                        [w.transcript[-1].id])


@router.get("/{wid}/notes")
async def notes(wid: str, uid: str = Uid):
    w = _member(wid, uid)
    return {"notes": w.notes, "preferences": get_preferences(w.owner_uid)}
