"""Phase 4: explicit post-talk feedback -> preference-update job (worker merges profile)."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..deps import Uid
from ..firestore import get_profile, new_id
from ..pubsub import enqueue
from ..schemas import Job, SlideFeedback
from .presentations import _member

router = APIRouter(prefix="/presentations/{pid}/feedback", tags=["feedback"])


class FeedbackReq(BaseModel):
    version: int
    items: list[SlideFeedback]


@router.post("")
async def submit(pid: str, req: FeedbackReq, uid: str = Uid):
    p = _member(pid, uid)
    job = Job(id=new_id(), type="feedback_update", uid=p.owner_uid,
              presentation_id=pid, version=req.version,
              payload={"items": [i.model_dump() for i in req.items]})
    enqueue(job)
    return {"job_id": job.id}


@router.get("/profile")
async def profile(pid: str, uid: str = Uid):
    p = _member(pid, uid)
    return get_profile(p.owner_uid)
