"""Phase 1a: the intake interview. One POST per user turn; agent replies or completes."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..agents.intake import intake_turn
from ..deps import Uid
from ..firestore import (
    append_build_event, get_build_events, get_profile, save_presentation,
)
from .presentations import _member

router = APIRouter(prefix="/presentations/{pid}/interview", tags=["interview"])

BUILD_SESSION = "main"   # one build session per presentation is enough for the hackathon


class MessageReq(BaseModel):
    text: str


@router.post("/message")
async def message(pid: str, req: MessageReq, uid: str = Uid):
    p = _member(pid, uid)
    profile = get_profile(p.owner_uid)
    history = [e for e in get_build_events(pid, BUILD_SESSION)
               if e.get("channel") == "interview"]

    append_build_event(pid, BUILD_SESSION,
                       {"channel": "interview", "role": "user", "uid": uid, "text": req.text})

    result = await intake_turn(uid, history, req.text, p.brief, profile)

    p.brief = result.brief
    save_presentation(p)
    append_build_event(pid, BUILD_SESSION,
                       {"channel": "interview", "role": "agent", "text": result.reply})
    return {"reply": result.reply, "brief": p.brief, "complete": p.brief.complete}


@router.get("/history")
async def history(pid: str, uid: str = Uid):
    _member(pid, uid)
    return [e for e in get_build_events(pid, BUILD_SESSION) if e.get("channel") == "interview"]
