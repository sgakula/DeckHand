"""Deckhand API service (Cloud Run).

Phases 0-2 and 5 live here; Phase 3's heavy lifting runs in the worker service
via Pub/Sub. See PROJECT_FLOW.txt at the repo root for the product flow.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import oauth
from .config import settings
from .routers import (
    feedback, interview, live, outline, presentations, slides, talks, versions,
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


@app.get("/healthz")
async def healthz():
    return {"ok": True}
