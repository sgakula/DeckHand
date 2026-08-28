"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { noteMeta } from "@/components/NoteKind";
import { PageHeader } from "@/components/PageHeader";
import { SlideCanvas } from "@/components/SlideCanvas";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { clockTime, plural } from "@/lib/format";
import { useAction, useResource } from "@/lib/hooks";
import { useSpeech } from "@/lib/useSpeech";
import type { TalkNote } from "@/lib/types";
import styles from "./present.module.css";

export default function PresentPage() {
  const { pid, presentation, lockedVersion, refreshTalks, talks } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const startAction = useAction();
  const stopAction = useAction();

  const liveTalk = talks?.find((t) => t.status === "live") ?? null;
  const [startedTalkId, setStartedTalkId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [localNotes, setLocalNotes] = useState<TalkNote[]>([]);
  const [localTranscript, setLocalTranscript] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [manual, setManual] = useState("");
  const startedAt = useRef<number | null>(null);

  // A talk already running (page reloaded mid-talk) is adopted by derivation, so
  // there is no effect copying server state into local state.
  const talkId = startedTalkId ?? liveTalk?.id ?? null;
  const notes = useMemo(
    () => [...localNotes, ...(liveTalk?.notes ?? [])],
    [localNotes, liveTalk],
  );
  const transcript = useMemo(
    () => [...(liveTalk?.transcript ?? []), ...localTranscript],
    [localTranscript, liveTalk],
  );

  // Present the locked version explicitly: the working draft is a different,
  // still-editable version once you reopen the deck after locking.
  const lockedDeck = useResource(
    () => api.getVersion(pid, lockedVersion?.version as number),
    [pid, lockedVersion?.version],
    { enabled: lockedVersion != null },
  );

  const slides = useMemo(
    () => [...(lockedDeck.data?.slides ?? [])].sort((a, b) => a.order - b.order),
    [lockedDeck.data],
  );
  const locked = lockedVersion != null;
  const current = slides[index] ?? null;
  const next = slides[index + 1] ?? null;
  const budget = presentation?.brief.duration_minutes ?? 10;

  useEffect(() => {
    if (!talkId) return;
    if (startedAt.current === null) {
      startedAt.current = liveTalk
        ? new Date(liveTalk.started_at).getTime()
        : Date.now();
    }
    const tick = setInterval(() => {
      if (startedAt.current) setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [talkId, liveTalk]);

  const pushWindow = useCallback(
    async (text: string) => {
      if (!talkId || !text.trim()) return;
      setLocalTranscript((t) => [...t, text]);
      try {
        const result = await api.pushTranscript(pid, talkId, {
          text,
          current_slide_id: current?.id ?? "",
          offset_seconds: startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0,
        });
        if (result.new_notes?.length) setLocalNotes((n) => [...result.new_notes, ...n]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not send transcript");
      }
    },
    [pid, talkId, current, toast],
  );

  const speech = useSpeech({ onFinalText: pushWindow, windowSeconds: 25 });

  // Arrow keys drive the deck once a talk is running.
  useEffect(() => {
    if (!talkId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, slides.length - 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [talkId, slides.length]);

  const start = async () => {
    const result = await startAction.run(() => api.startTalk(pid));
    if (result) {
      setStartedTalkId(result.talk_id);
      startedAt.current = Date.now();
      setIndex(0);
      setLocalNotes([]);
      setLocalTranscript([]);
      refreshTalks();
      toast.success("Talk started — the agent is listening only");
    }
  };

  const stop = async () => {
    if (!talkId) return;
    if (speech.listening) speech.stop();
    const result = await stopAction.run(() => api.stopTalk(pid, talkId));
    if (result) {
      refreshTalks();
      toast.success("Talk stopped — running the post-talk pipeline");
      router.push(`/p/${pid}/debrief`);
    }
  };

  // ---- gates ----

  if (!locked) {
    return (
      <>
        <PageHeader eyebrow="Phase 2" title="Present" />
        <Card pad="none">
          <EmptyState
            icon={<Icon name="lock" size={24} />}
            title="Lock the deck first"
            body="Slides are frozen before a talk on purpose: during the talk the agent is listen-only, so there is nothing that can change under you mid-sentence."
            actions={
              <Button variant="primary" onClick={() => router.push(`/p/${pid}/rehearse`)}>
                Go to rehearse
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  if (!talkId) {
    return (
      <>
        <PageHeader
          eyebrow="Phase 2"
          title="Present"
          description="Deckhand sits in as a silent note-taker. It never edits a slide while you are talking."
        />
        <div className={styles.ready}>
          <Card>
            <div className={styles.readyRow}>
              <div className={styles.readyText}>
                Version {lockedVersion?.version} is locked with {plural(slides.length, "slide")}, budgeted at{" "}
                {budget} minutes.
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={start}
                pending={startAction.pending}
                leading={<Icon name="play" size={16} />}
              >
                Start talk
              </Button>
            </div>
            {startAction.error && (
              <div style={{ marginTop: "var(--s4)" }}>
                <Alert tone="danger" title="Could not start the talk">
                  {startAction.error}
                </Alert>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="What happens while you present" />
            <div className={styles.rules}>
              <div className={styles.rule}>
                <Icon name="micOff" size={18} className={styles.ruleIcon} />
                <span>
                  The agent listens and writes notes. It does not edit slides, and the only screen
                  action it can take is advancing to the next slide.
                </span>
              </div>
              <div className={styles.rule}>
                <Icon name="brief" size={18} className={styles.ruleIcon} />
                <span>
                  It flags audience questions, commitments you make, objections, skipped sections,
                  and any number that does not match your sources.
                </span>
              </div>
              <div className={styles.rule}>
                <Icon name="sparkle" size={18} className={styles.ruleIcon} />
                <span>
                  When you stop, the follow-up pipeline runs in the background: Slides export,
                  recap email, tasks, and suggested edits for the next version.
                </span>
              </div>
            </div>
          </Card>
        </div>
      </>
    );
  }

  const overtime = elapsed > budget * 60;

  return (
    <>
      <div className={styles.liveBar}>
        <Badge tone="danger" live>
          Live
        </Badge>
        <span className={[styles.timer, overtime && styles.timerOver].filter(Boolean).join(" ")}>
          {clockTime(elapsed)}
        </span>
        <span className={styles.barMeta}>
          <span>of {budget}:00</span>
        </span>
        <span className={styles.barSpacer} />
        <span className={styles.barMeta}>
          <Icon name="debrief" size={15} />
          {plural(notes.length, "note")}
        </span>
        <div className={styles.barActions}>
          {speech.supported && (
            <Button
              variant={speech.listening ? "tonal" : "secondary"}
              size="sm"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              leading={<Icon name={speech.listening ? "mic" : "micOff"} size={15} />}
            >
              {speech.listening ? "Listening" : "Start mic"}
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={stop}
            pending={stopAction.pending}
            leading={<Icon name="stop" size={14} />}
          >
            Stop talk
          </Button>
        </div>
      </div>

      {speech.error && (
        <div style={{ marginBottom: "var(--s4)" }}>
          <Alert tone="warning">{speech.error}</Alert>
        </div>
      )}

      <div className={styles.stage}>
        <div className={styles.stageMain}>
          {current && (
            <div className={styles.current}>
              <SlideCanvas slide={current} showProvenance={false} bordered={false} />
            </div>
          )}

          <div className={styles.navRow}>
            <Button
              variant="secondary"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              leading={<Icon name="arrowLeft" size={16} />}
            >
              Previous
            </Button>
            <span className={styles.navSpacer} />
            <span className={styles.position}>
              {index + 1} / {slides.length}
            </span>
            <span className={styles.navSpacer} />
            <Button
              variant="primary"
              onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
              disabled={index >= slides.length - 1}
              trailing={<Icon name="arrowRight" size={16} />}
            >
              Next
            </Button>
          </div>

          {next && (
            <div className={styles.nextPeek}>
              <span className={styles.nextLabel}>Next</span>
              <span className={styles.nextThumb}>
                <SlideCanvas slide={next} showProvenance={false} />
              </span>
              <span className={styles.nextTitle}>{next.title}</span>
            </div>
          )}

          {current?.speaker_notes && (
            <Card>
              <CardHeader title="Speaker notes" />
              <p className={styles.notes}>{current.speaker_notes}</p>
            </Card>
          )}
        </div>

        <aside className={styles.side}>
          <Card>
            <CardHeader
              title="Live notes"
              subtitle="Written by the note-taker as you speak"
            />
            {notes.length === 0 ? (
              <p style={{ fontSize: "var(--text-base)", color: "var(--text-tertiary)" }}>
                Nothing flagged yet. Notes appear when the agent hears a question, a commitment,
                an objection, or a number that does not match your sources.
              </p>
            ) : (
              <div className={styles.noteList}>
                {notes.map((n, i) => {
                  const meta = noteMeta(n.kind);
                  return (
                    <div key={i} className={styles.note}>
                      <span className={styles.noteIcon}>
                        <Icon name={meta.icon} size={16} />
                      </span>
                      <div className={styles.noteBody}>
                        <div className={styles.noteText}>{n.text}</div>
                        <div className={styles.noteMeta}>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <span>{clockTime(n.at_seconds)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Transcript"
              subtitle={
                speech.listening
                  ? "Listening — windows are sent every 25 seconds"
                  : "Mic is off. You can paste what was said instead."
              }
            />
            <div className={styles.transcript}>
              {speech.interim && <span className={styles.interim}>{speech.interim}</span>}
              {[...transcript].reverse().map((t, i) => (
                <span key={i}>{t}</span>
              ))}
              {transcript.length === 0 && !speech.interim && (
                <span className={styles.interim}>Nothing captured yet.</span>
              )}
            </div>

            <div className={styles.pushRow} style={{ marginTop: "var(--s4)" }}>
              <Textarea
                value={manual}
                rows={3}
                placeholder="Type or paste a chunk of what you just said…"
                onChange={(e) => setManual(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!manual.trim()}
                onClick={() => {
                  void pushWindow(manual);
                  setManual("");
                }}
                leading={<Icon name="send" size={14} />}
              >
                Send to note-taker
              </Button>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
