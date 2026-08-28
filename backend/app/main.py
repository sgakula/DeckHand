"""Deckhand API service (Cloud Run).

Phases 0-2 and 5 live here; Phase 3's heavy lifting runs in the worker service
via Pub/Sub. See PROJECT_FLOW.txt at the repo root for the product flow.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import oauth
from .images import MEDIA_DIR
from .config import settings
from .routers import (
    feedback, interview, jobs, live, outline, presentations, session, slides, talks,
    versions,
)
from .tracing import setup_tracing

app = FastAPI(title="Deckhand API", version="0.1.0")
setup_tracing(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings().frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(oauth.router)
app.include_router(presentations.router)
app.include_router(interview.router)
app.include_router(outline.router)
app.include_router(slides.router)
app.include_router(talks.router)
app.include_router(live.router)
app.include_router(feedback.router)
app.include_router(versions.router)
app.include_router(jobs.router)
app.include_router(session.router)

# Generated visuals the composer embeds by URL.
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")


@app.get("/healthz")
async def healthz():
    return {"ok": True}
