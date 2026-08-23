"""Phase 5: version history, compare, revert, and agent-driven branching."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..deps import Uid
from ..firestore import (
    get_version, list_versions, new_id, save_presentation, save_version,
)
from ..pubsub import enqueue
from ..schemas import DeckVersion, Job
from .presentations import _member

router = APIRouter(prefix="/presentations/{pid}/versions", tags=["versions"])


class BranchReq(BaseModel):
    instruction: str      # e.g. "make a 5-minute customer version of this deck"


@router.get("")
async def index(pid: str, uid: str = Uid):
    _member(pid, uid)
    return [
        {"version": v.version, "locked": v.locked, "created_at": v.created_at,
         "branch_label": v.branch_label, "parent_version": v.parent_version,
         "slides": len(v.slides), "slides_file_id": v.slides_file_id}
        for v in list_versions(pid)
    ]


@router.get("/{version}")
async def get(pid: str, version: int, uid: str = Uid):
    _member(pid, uid)
    v = get_version(pid, version)
    if v is None:
        raise HTTPException(404, "version not found")
    return v


@router.get("/{a}/diff/{b}")
async def diff(pid: str, a: int, b: int, uid: str = Uid):
    """Cheap structural diff between two versions (added/removed/changed slides)."""
    _member(pid, uid)
    va, vb = get_version(pid, a), get_version(pid, b)
    if va is None or vb is None:
        raise HTTPException(404, "version not found")
    sa = {s.id: s for s in va.slides}
    sb = {s.id: s for s in vb.slides}
    return {
        "added": [sid for sid in sb if sid not in sa],
        "removed": [sid for sid in sa if sid not in sb],
        "changed": [sid for sid in sa.keys() & sb.keys()
                    if sa[sid].model_dump() != sb[sid].model_dump()],
    }


@router.post("/{version}/revert")
async def revert(pid: str, version: int, uid: str = Uid):
    """Copy an old version's slides into a new unlocked draft."""
    p = _member(pid, uid)
    if uid != p.owner_uid:
        raise HTTPException(403, "only the presenter reverts")
    old = get_version(pid, version)
    if old is None:
        raise HTTPException(404, "version not found")
    draft = DeckVersion(version=p.current_version + 1, slides=old.slides,
                        parent_version=version, branch_label=f"revert of v{version}")
    p.current_version = draft.version
    save_version(pid, draft)
    save_presentation(p)
    return draft


@router.post("/{version}/branch")
async def branch(pid: str, version: int, req: BranchReq, uid: str = Uid):
    """Agent-driven variant: the worker regenerates the deck per the instruction."""
    p = _member(pid, uid)
    src = get_version(pid, version)
    if src is None or not src.locked:
        raise HTTPException(409, "branch from a locked version")
    job = Job(id=new_id(), type="branch_deck", uid=p.owner_uid,
              presentation_id=pid, version=version,
              payload={"instruction": req.instruction})
    enqueue(job)
    return {"job_id": job.id}
