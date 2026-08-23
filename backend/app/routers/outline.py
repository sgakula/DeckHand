"""Phase 1, steps 6-7: propose outline, collaborative edits, approval gate."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.planner import propose_outline
from ..deps import Uid
from ..firestore import append_build_event, get_profile, save_presentation
from ..schemas import Outline, now
from .interview import BUILD_SESSION
from .presentations import _member

router = APIRouter(prefix="/presentations/{pid}/outline", tags=["outline"])


class OutlineUpdate(BaseModel):
    outline: Outline


@router.post("/propose")
async def propose(pid: str, uid: str = Uid):
    p = _member(pid, uid)
    if not p.brief.complete:
        raise HTTPException(409, "finish the interview first")
    p.outline = await propose_outline(uid, p.brief, p.facts, get_profile(p.owner_uid))
    save_presentation(p)
    append_build_event(pid, BUILD_SESSION, {"channel": "outline", "role": "agent",
                                            "text": "proposed outline"})
    return p.outline


@router.put("")
async def update(pid: str, req: OutlineUpdate, uid: str = Uid):
    """Any member can edit the outline cards before approval."""
    p = _member(pid, uid)
    if p.outline.approved:
        raise HTTPException(409, "outline already approved")
    req.outline.approved = False
    p.outline = req.outline
    save_presentation(p)
    append_build_event(pid, BUILD_SESSION, {"channel": "outline", "role": "user",
                                            "uid": uid, "text": "edited outline"})
    return p.outline


@router.post("/approve")
async def approve(pid: str, uid: str = Uid):
    """First human-in-the-loop gate. Owner-only."""
    p = _member(pid, uid)
    if uid != p.owner_uid:
        raise HTTPException(403, "only the presenter approves the outline")
    p.outline.approved = True
    p.outline.approved_at = now()
    save_presentation(p)
    append_build_event(pid, BUILD_SESSION, {"channel": "outline", "role": "user",
                                            "uid": uid, "text": "APPROVED outline"})
    return p.outline
