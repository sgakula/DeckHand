"""Presentation CRUD, membership, and source-file connection (Phase 0)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.context import extract_facts
from ..deps import Uid
from ..firestore import (
    create_presentation, list_presentations, new_id, require_member, save_presentation,
)
from ..schemas import Presentation

router = APIRouter(prefix="/presentations", tags=["presentations"])


class CreateReq(BaseModel):
    title: str = "Untitled presentation"


class MembersReq(BaseModel):
    member_uids: list[str]


class SourcesReq(BaseModel):
    file_ids: list[str]


def _member(pid: str, uid: str) -> Presentation:
    try:
        return require_member(pid, uid)
    except LookupError:
        raise HTTPException(404, "presentation not found")
    except PermissionError:
        raise HTTPException(403, "not a member")


@router.post("")
async def create(req: CreateReq, uid: str = Uid):
    p = Presentation(id=new_id(), owner_uid=uid, title=req.title, member_uids=[uid])
    create_presentation(p)
    return p


@router.get("")
async def mine(uid: str = Uid):
    return list_presentations(uid)


@router.get("/{pid}")
async def get(pid: str, uid: str = Uid):
    return _member(pid, uid)


@router.post("/{pid}/members")
async def set_members(pid: str, req: MembersReq, uid: str = Uid):
    p = _member(pid, uid)
    if uid != p.owner_uid:
        raise HTTPException(403, "only the owner edits membership")
    p.member_uids = sorted(set(req.member_uids) | {p.owner_uid})
    save_presentation(p)
    return p


@router.post("/{pid}/sources")
async def connect_sources(pid: str, req: SourcesReq, uid: str = Uid):
    """Connect Drive files and run the context agent to extract sourced facts."""
    p = _member(pid, uid)
    p.source_file_ids = req.file_ids
    p.facts = await extract_facts(uid, req.file_ids)
    save_presentation(p)
    return {"facts": p.facts}
