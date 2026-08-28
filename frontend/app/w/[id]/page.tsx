"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactFrame } from "@/components/workspace/ArtifactFrame";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ShimmerLabel } from "@/components/ui/Generating";
import { LoadingBlock, Alert } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { clockTime, errorMessage } from "@/lib/format";
import { withViewTransition } from "@/lib/viewTransition";
import { useSpeech } from "@/lib/useSpeech";
import { SCRIPT, SPEAKERS, speakerColor } from "@/lib/script";
import type { Artifact } from "@/lib/artifacts";
import type { Workspace, WorkspacePage } from "@/lib/types";
import styles from "./workspace.module.css";

const TOOLS: { id: string; label: string; icon: IconName; connected: boolean }[] = [
  { id: "drive", label: "Drive", icon: "sources", connected: true },
  { id: "sheets", label: "Sheets", icon: "chart", connected: true },
  { id: "gmail", label: "Gmail", icon: "brief", connected: true },
  { id: "calendar", label: "Calendar", icon: "clock", connected: false },
];

function asArtifact(page: WorkspacePage): Artifact {
  return {
    id: page.id,
    title: page.label,
    kind: "slide",
    aspect: 16 / 9,
    body: page.body,
    state: "ready",
    version: 1,
    updatedAt: page.updated_at ?? "",
    updatedBy: "you",
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [thinking, setThinking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showWhy, setShowWhy] = useState(false);
  const feedEnd = useRef<HTMLDivElement>(null);
  const [queued, setQueued] = useState(0);
  const wsRef = useRef<Workspace | null>(null);

  // ---- load or create ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w =
          id === "new"
            ? await api.createWorkspace("Untitled session", "presentation")
            : await api.getWorkspace(id);
        if (cancelled) return;
        setWorkspace(w);
        setActiveId(w.pages[0]?.id ?? "");
        if (id === "new") router.replace(`/w/${w.id}`);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
    wsRef.current = workspace;
  });

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [workspace?.events.length, thinking]);

  // ---- the loop ----------------------------------------------------------

  const applyResult = useCallback(
    (next: Workspace, changedPage?: string) => {
      withViewTransition(() => {
        setWorkspace(next);
        if (changedPage) setActiveId(changedPage);
      });
    },
    [],
  );

  // Utterances queue rather than block. A slow turn (model backoff can be 30s on
  // the free tier) must never stop the room from talking, but the transcript has
  // to stay ordered, so they drain one at a time.
  const queue = useRef<{ speaker: string; text: string }[]>([]);
  const draining = useRef(false);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length) {
        const turn = queue.current.shift()!;
        const current = wsRef.current;
        if (!current) break;
        setThinking(true);
        try {
          const result = await api.sendUtterance(current.id, turn.speaker, turn.text);
          applyResult(result.workspace, result.decision === "act" ? result.page_id : undefined);
          if (result.decision === "act" && result.unsourced?.length) {
            toast.show(`${result.unsourced.length} claim needs a source`, { tone: "error" });
          }
        } catch (err) {
          toast.error(errorMessage(err));
        }
      }
    } finally {
      draining.current = false;
      setThinking(false);
    }
  }, [applyResult, toast]);

  const say = useCallback(
    (speaker: string, text: string) => {
      if (!text.trim()) return;
      queue.current.push({ speaker, text: text.trim() });
      setQueued(queue.current.length);
      void drain().then(() => setQueued(queue.current.length));
    },
    [drain],
  );

  const answer = useCallback(
    async (choice: string) => {
      if (!workspace) return;
      setThinking(true);
      try {
        const result = await api.answerQuestion(workspace.id, choice);
        applyResult(result.workspace, result.page_id);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setThinking(false);
      }
    },
    [workspace, applyResult, toast],
  );

  const rate = useCallback(
    async (eventId: string, rating: "up" | "down") => {
      if (!workspace) return;
      // Optimistic: the thumb should land instantly even though it also
      // writes a preference that outlives this session.
      setWorkspace((w) =>
        w
          ? {
              ...w,
              events: w.events.map((e) => (e.id === eventId ? { ...e, rating } : e)),
            }
          : w,
      );
      try {
        await api.rateAction(workspace.id, eventId, rating);
        if (rating === "down") toast.show("Noted — I'll adjust", { tone: "info" });
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [workspace, toast],
  );

  const resolveStep = useCallback(
    async (accept: boolean) => {
      if (!workspace) return;
      setThinking(true);
      try {
        const result = await api.resolveNextStep(workspace.id, accept);
        applyResult(result.workspace, accept ? result.page_id : undefined);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setThinking(false);
      }
    },
    [workspace, applyResult, toast],
  );

  // Your real voice goes in as "You"; teammates are injected for a solo demo.
  const speech = useSpeech({
    onFinalText: (text) => say("You", text),
    windowSeconds: 6,
  });

  // ---- derived -----------------------------------------------------------

  const pages = workspace?.pages ?? [];
  const active = pages.find((p) => p.id === activeId) ?? pages[0];
  const activeArtifact = useMemo(() => (active ? asArtifact(active) : null), [active]);
  const pending = workspace?.pending_question ?? null;

  const speakers = useMemo(() => {
    const names = new Set<string>(Object.keys(SPEAKERS));
    workspace?.transcript.forEach((t) => names.add(t.speaker));
    return [...names];
  }, [workspace]);

  /** How far through the script we are, derived from the server transcript. */
  const sent = workspace?.transcript.length ?? 0;

  const utteranceById = useMemo(() => {
    const map = new Map<string, string>();
    workspace?.transcript.forEach((t) => map.set(t.id, `${t.speaker}: ${t.text}`));
    return map;
  }, [workspace]);

  if (loadError) {
    return (
      <div className={styles.shell}>
        <div style={{ maxWidth: 520, margin: "18vh auto" }}>
          <Alert tone="danger" title="Could not open this workspace">
            {loadError}
          </Alert>
        </div>
      </div>
    );
  }

  if (!workspace || !active || !activeArtifact) {
    return (
      <div className={styles.shell}>
        <LoadingBlock label="Opening the session…" />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href="/" className={styles.back} aria-label="All workspaces">
          <Icon name="arrowLeft" size={17} />
        </Link>
        <span className={styles.name}>{workspace.title}</span>
        <span className={styles.kindChip}>{workspace.kind}</span>
        <span className={styles.livePill}>
          <span className={styles.liveDot} />
          LIVE {clockTime(elapsed)}
        </span>

        <span className={styles.barSpacer} />

        <div className={styles.tools}>
          {TOOLS.map((tool) => (
            <span
              key={tool.id}
              className={[styles.tool, !tool.connected && styles.toolOff]
                .filter(Boolean)
                .join(" ")}
            >
              <Icon name={tool.icon} size={13} />
              {tool.label}
            </span>
          ))}
        </div>

        <Button variant="secondary" size="sm" leading={<Icon name="users" size={15} />}>
          Invite
        </Button>
      </header>

      <div className={styles.body}>
        <main className={styles.stage}>
          <div className={styles.stageWrap}>
            {thinking && (
              <span className={styles.updateBadge}>
                <ShimmerLabel>Following the conversation…</ShimmerLabel>
              </span>
            )}
            <div
              className={[styles.renderer, thinking && styles.rendererLive]
                .filter(Boolean)
                .join(" ")}
            >
              <ArtifactFrame artifact={activeArtifact} logicalWidth={1400} />
            </div>
          </div>

          {/* A claim the agent could not tie to a connected source. */}
          {active.unsourced.length > 0 && (
            <div className={styles.unsourced}>
              <Icon name="warning" size={15} />
              <span className={styles.unsourcedText}>
                {active.unsourced.length === 1
                  ? active.unsourced[0]
                  : `${active.unsourced.length} claims on this page have no source`}
              </span>
              <span className={styles.unsourcedTag}>unsourced</span>
            </div>
          )}

          <div className={styles.filmstrip}>
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={[styles.frame, page.id === activeId && styles.frameActive]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setActiveId(page.id)}
              >
                <ArtifactFrame artifact={asArtifact(page)} logicalWidth={700} />
                {page.unsourced.length > 0 && <span className={styles.frameWarn} />}
                <span className={styles.frameLabel}>{page.label}</span>
              </button>
            ))}
          </div>
        </main>

        <aside className={styles.rail}>
          <div className={styles.railHead}>
            <span className={styles.railTitle}>Session</span>
            {active.caused_by.length > 0 && (
              <button
                type="button"
                className={styles.whyBtn}
                onClick={() => setShowWhy((v) => !v)}
              >
                Why this page?
              </button>
            )}
          </div>

          {/* Provenance: the sentences that produced what is on screen. */}
          {showWhy && active.caused_by.length > 0 && (
            <div className={styles.why}>
              <span className={styles.whyLabel}>This page came from</span>
              {active.caused_by.map((uid) => (
                <span key={uid} className={styles.whyLine}>
                  “{utteranceById.get(uid) ?? "an earlier turn"}”
                </span>
              ))}
            </div>
          )}

          {/* The agent leading rather than waiting. Declining is remembered. */}
          {workspace.next_step && (
            <div className={styles.nudge}>
              <span className={styles.nudgeIcon}>
                <Icon name="sparkle" size={14} />
              </span>
              <span className={styles.nudgeBody}>
                <span className={styles.nudgeText}>{workspace.next_step}</span>
                <span className={styles.nudgeActions}>
                  <button
                    type="button"
                    className={styles.nudgeYes}
                    onClick={() => void resolveStep(true)}
                  >
                    Do it
                  </button>
                  <button
                    type="button"
                    className={styles.nudgeNo}
                    onClick={() => void resolveStep(false)}
                  >
                    Not now
                  </button>
                </span>
              </span>
            </div>
          )}

          <div className={styles.feed}>
            {workspace.events.length === 0 && (
              <span className={styles.listening}>
                <Icon name="mic" size={14} />
                Listening for the discussion…
              </span>
            )}

            {workspace.events.map((event) => {
              if (event.kind === "speech") {
                return (
                  <div key={event.id} className={styles.speech}>
                    <span
                      className={styles.speechAvatar}
                      style={{ background: speakerColor(event.speaker) }}
                    >
                      {initials(event.speaker)}
                    </span>
                    <span className={styles.speechBody}>
                      <span
                        className={styles.speechName}
                        style={{ color: speakerColor(event.speaker) }}
                      >
                        {event.speaker}
                      </span>
                      <span className={styles.speechText}>{event.text}</span>
                    </span>
                  </div>
                );
              }

              if (event.kind === "held") {
                // The agent explaining why it did nothing is the whole point.
                return (
                  <div key={event.id} className={styles.held}>
                    <Icon name="clock" size={13} />
                    {event.reason}
                  </div>
                );
              }

              if (event.kind === "asked") {
                const isPending = pending?.id === event.id;
                return (
                  <div key={event.id} className={styles.ask}>
                    <span className={styles.askLabel}>
                      <Icon name="info" size={13} />
                      Needs a decision
                    </span>
                    <span className={styles.askText}>{event.text}</span>
                    {isPending && (
                      <span className={styles.askOptions}>
                        {event.options.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={styles.askOption}
                            onClick={() => void answer(option)}
                          >
                            {option}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                );
              }

              if (event.kind === "answered") {
                return (
                  <div key={event.id} className={styles.answered}>
                    <Icon name="check" size={13} />
                    You chose “{event.text}”
                  </div>
                );
              }

              return (
                <div key={event.id} className={styles.action}>
                  <Icon name="sparkle" size={15} className={styles.actionIcon} />
                  <span className={styles.actionBody}>
                    <span className={styles.actionText}>{event.text}</span>
                    <span className={styles.actionMeta}>
                      <button
                        type="button"
                        className={styles.jump}
                        onClick={() => setActiveId(event.page_id)}
                      >
                        {pages.find((p) => p.id === event.page_id)?.label ?? "page"}
                      </button>
                      <span className={styles.rate}>
                        <button
                          type="button"
                          className={[styles.rateBtn, event.rating === "up" && styles.rateOn]
                            .filter(Boolean)
                            .join(" ")}
                          aria-label="Good call"
                          onClick={() => void rate(event.id, "up")}
                        >
                          <Icon name="thumbUp" size={13} />
                        </button>
                        <button
                          type="button"
                          className={[styles.rateBtn, event.rating === "down" && styles.rateOff]
                            .filter(Boolean)
                            .join(" ")}
                          aria-label="Not what we wanted"
                          onClick={() => void rate(event.id, "down")}
                        >
                          <Icon name="thumbDown" size={13} />
                        </button>
                      </span>
                    </span>
                  </span>
                </div>
              );
            })}

            {thinking && (
              <span className={styles.listening}>
                <ShimmerLabel>Thinking…</ShimmerLabel>
              </span>
            )}
            <div ref={feedEnd} />
          </div>

          {/* What a good facilitator would have written down. */}
          {workspace.notes.length > 0 && (
            <div className={styles.notes}>
              <span className={styles.notesLabel}>
                Notes
                <span className={styles.notesCount}>{workspace.notes.length}</span>
              </span>
              <div className={styles.notesList}>
                {workspace.notes.slice(-5).map((note) => (
                  <span key={note.id} className={styles.note}>
                    <span className={`${styles.noteKind} ${styles[note.kind] ?? ""}`}>
                      {note.kind.replace("_", " ")}
                    </span>
                    <span className={styles.noteText}>
                      {note.text}
                      {note.owner && <strong> · {note.owner}</strong>}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* The scripted conversation. Click a line and that person says it into
              the real agent loop — only the voices are staged. */}
          <div className={styles.script}>
            <span className={styles.scriptLabel}>
              Script
              <span className={styles.scriptProgress}>
                {Math.min(sent, SCRIPT.length)}/{SCRIPT.length}
              </span>
            </span>
            <div className={styles.scriptList}>
              {SCRIPT.map((line, i) => {
                const done = i < sent;
                const isNext = i === sent;
                return (
                  <button
                    key={line.n}
                    type="button"
                    className={[
                      styles.line,
                      done && styles.lineDone,
                      isNext && styles.lineNext,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={thinking}
                    onClick={() => say(line.speaker, line.text)}
                  >
                    <span
                      className={styles.lineWho}
                      style={{ background: SPEAKERS[line.speaker] ?? "#888" }}
                    >
                      {line.speaker[0]}
                    </span>
                    <span className={styles.lineBody}>
                      <span className={styles.lineText}>{line.text}</span>
                      <span className={styles.lineBeat}>
                        <span className={styles.lineExpect} data-expect={line.expect}>
                          {line.expect}
                        </span>
                        {line.beat}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      <footer className={styles.callBar}>
        <Button
          variant={speech.listening ? "danger" : "secondary"}
          size="sm"
          iconOnly
          aria-label={speech.listening ? "Stop listening" : "Start listening"}
          disabled={!speech.supported}
          onClick={() => (speech.listening ? speech.stop() : speech.start())}
          leading={<Icon name={speech.listening ? "mic" : "micOff"} size={16} />}
        />

        <div className={styles.callPeople}>
          {speakers.map((person) => (
            <span
              key={person}
              className={styles.person}
              style={{ ["--speaker-color" as string]: speakerColor(person) }}
            >
              <span
                className={styles.personAvatar}
                style={{ background: speakerColor(person) }}
              >
                {initials(person)}
              </span>
              <span className={styles.personName}>{person}</span>
            </span>
          ))}

          <span className={styles.agentChip}>
            <span className={styles.agentWave} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            {queued > 1
              ? `Deckhand is thinking · ${queued - 1} queued`
              : thinking
                ? "Deckhand is thinking"
                : "Deckhand is listening"}
          </span>
        </div>

        {speech.interim && <span className={styles.interim}>{speech.interim}</span>}

        <div className={styles.callActions}>
          <Button variant="secondary" size="sm" leading={<Icon name="download" size={15} />}>
            Export
          </Button>
          <Button variant="danger" size="sm" onClick={() => router.push("/")}>
            Leave
          </Button>
        </div>
      </footer>
    </div>
  );
}

