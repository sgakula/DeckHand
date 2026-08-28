"""Background-job status. The UI polls this after Lock Deck / Stop talk / Branch."""
from fastapi import APIRouter, HTTPException

from ..deps import Uid
from ..firestore import get_build_events, get_job
from .interview import BUILD_SESSION
from .presentations import _member

router = APIRouter(tags=["jobs"])


@router.get("/jobs/{job_id}")
async def job_status(job_id: str, uid: str = Uid):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    if job.uid != uid:
        raise HTTPException(403, "not your job")
    return job


@router.get("/presentations/{pid}/activity")
async def activity(pid: str, uid: str = Uid):
    """Full build-session event stream (interview, outline, builder) for the timeline."""
    _member(pid, uid)
    return get_build_events(pid, BUILD_SESSION)
