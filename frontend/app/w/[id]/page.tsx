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
import { api, liveSocketUrl } from "@/lib/api";
import { clockTime, errorMessage } from "@/lib/format";
import { withViewTransition } from "@/lib/viewTransition";
import { useSpeech } from "@/lib/useSpeech";
import { useRestSpeech } from "@/lib/useRestSpeech";
import { useLiveAudio } from "@/lib/useLiveAudio";
import { guestName, setGuestName } from "@/lib/identity";
import { SCRIPT, SESSION_TITLE, SPEAKERS, scriptProgress, speakerColor } from "@/lib/script";
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  // Scripted-demo mode is strictly opt-in: open /w/new?demo (or any workspace
  // with ?demo) to get the canned meeting, its play controls, and its cast.
  // Without the flag the room is real people only.
  const [demoMode, setDemoMode] = useState(false);
  // Live OAuth status drives the tool chips; null until known.
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  useEffect(() => {
    api.googleStatus().then((s) => setGoogleConnected(s.connected)).catch(() => undefined);
  }, []);
  useEffect(() => {
    setDemoMode(new URLSearchParams(window.location.search).has("demo"));
  }, []);
  // Who this browser is in the room. Empty until the person names themselves.
  const [myName, setMyName] = useState("");
  const [askName, setAskName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    const known = guestName();
    if (known) setMyName(known);
    else setAskName(true);
  }, []);
  const [activeId, setActiveId] = useState<string>("");
  const [thinking, setThinking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showWhy, setShowWhy] = useState(false);
  const feedEnd = useRef<HTMLDivElement>(null);
  const [queued, setQueued] = useState(0);
  const wsRef = useRef<Workspace | null>(null);

  // ---- scripted playback: one click runs the whole meeting ----------------
  const playing = useRef(false);
  const [playUi, setPlayUi] = useState<"idle" | "running" | "awaiting">("idle");
  const playUiRef = useRef(playUi);
  const [speakingN, setSpeakingN] = useState<number | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  // Which suggestion was allowed to speak. A new suggestion is a new raised
  // hand, so this compares against the current next_step instead of a boolean.
  const [openedStep, setOpenedStep] = useState("");

  // ---- load or create ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const demo = new URLSearchParams(window.location.search).has("demo");
        const w =
          id === "new"
            ? await api.createWorkspace(demo ? SESSION_TITLE : "Working session", "presentation")
            : await api.joinWorkspace(id); // idempotent: the link IS the invite
        if (cancelled) return;
        setWorkspace(w);
        setActiveId(w.pages[0]?.id ?? "");
        if (id === "new") router.replace(`/w/${w.id}${demo ? "?demo" : ""}`);
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
    playUiRef.current = playUi;
  });


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
        // Coalesce the backlog: an agent turn takes seconds while speech keeps
        // arriving, so consecutive windows from the same speaker are merged
        // into ONE utterance instead of one model turn each. The agent hears
        // what was actually said; the queue can no longer snowball.
        while (queue.current[0]?.speaker === turn.speaker) {
          turn.text += " " + queue.current.shift()!.text;
        }
        setQueued(queue.current.length);
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
      const trimmed = text.trim();
      if (!trimmed) return;
      // Mic noise guard: stray fragments ("zero", "00:00", "uh") each cost a
      // full agent turn and clog the queue. Require a real sentence — unless
      // the agent just asked the group a question, where "no" is an answer.
      const awaitingAnswer = Boolean(wsRef.current?.pending_question);
      const words = trimmed.split(/\s+/).length;
      const looksLikeSpeech = words >= 3 || trimmed.length >= 18;
      if (!awaitingAnswer && !looksLikeSpeech) return;
      queue.current.push({ speaker, text: trimmed });
      setQueued(queue.current.length);
      void drain().then(() => setQueued(queue.current.length));
    },
    [drain],
  );

  // Runs the script like a meeting actually unfolds: a beat while the person
  // "speaks", the agent decides live, then a pause so the eye lands on what
  // changed. When the agent asks the group a question, playback stops and waits
  // for a human to answer — the whole point — then resumes on its own.
  const runScript = useCallback(async () => {
    if (playing.current) return;
    playing.current = true;
    setPlayUi("running");
    try {
      // Let the last state flush before reading it (resume after an answer).
      await sleep(150);
      while (playing.current) {
        const current = wsRef.current;
        if (!current) break;
        if (current.pending_question) {
          setPlayUi("awaiting");
          return;
        }
        const idx = scriptProgress(current.transcript);
        if (idx >= SCRIPT.length) break;
        const line = SCRIPT[idx];
        setSpeakingN(line.n);
        await sleep(450);
        setThinking(true);
        let acted = false;
        try {
          const result = await api.sendUtterance(current.id, line.speaker, line.text);
          acted = result.decision === "act";
          applyResult(result.workspace, acted ? result.page_id : undefined);
          if (acted && result.unsourced?.length) {
            toast.show(`${result.unsourced.length} claim needs a source`, { tone: "error" });
          }
        } catch (err) {
          toast.error(errorMessage(err));
          break; // Play again resumes exactly here — progress lives on the server.
        } finally {
          setThinking(false);
          setSpeakingN(null);
        }
        await sleep(acted ? 1300 : 700);
      }
    } finally {
      playing.current = false;
      setPlayUi((state) => (state === "awaiting" ? state : "idle"));
    }
  }, [applyResult, toast]);

  const stopScript = useCallback(() => {
    playing.current = false;
    // Instant feedback: the loop still finishes the utterance already in
    // flight (a model turn cannot be recalled), then halts.
    setPlayUi("idle");
    toast.show("Pausing after the current line finishes");
  }, [toast]);

  const answer = useCallback(
    async (choice: string) => {
      if (!workspace) return;
      setThinking(true);
      try {
        const result = await api.answerQuestion(workspace.id, choice);
        applyResult(result.workspace, result.page_id);
        if (playUiRef.current === "awaiting") {
          setPlayUi("idle");
          void runScript();
        }
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setThinking(false);
      }
    },
    [workspace, applyResult, toast, runScript],
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

  // Your real voice goes in under your chosen name; scripted teammates are
  // injected only for the solo demo.
  const browserSpeech = useSpeech({
    onFinalText: (text) => say(myName || "You", text),
    windowSeconds: 6,
  });

  // Brave ships a SpeechRecognition that looks supported but returns nothing
  // (the backend was stripped). There — or when browser STT errors — capture
  // raw PCM instead and let the backend's Gemini transcription do the work.
  const restSpeech = useRestSpeech({
    onAudio: async (pcmBase64) => {
      const wid = wsRef.current?.id;
      if (!wid) return;
      try {
        const { text } = await api.transcribeAudio(wid, pcmBase64);
        if (text) say(myName || "You", text);
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
  });
  const [useRest, setUseRest] = useState(false);
  useEffect(() => {
    const braveish = Boolean((navigator as { brave?: unknown }).brave);
    if (braveish || !browserSpeech.supported) setUseRest(true);
  }, [browserSpeech.supported]);
  useEffect(() => {
    if (browserSpeech.error) setUseRest(true);
  }, [browserSpeech.error]);

  // Primary mic: Gemini Live via the backend broker - streaming captions in
  // every Chromium browser, utterances split on natural pauses server-side.
  // Any Live failure drops to browser STT, then to the REST PCM fallback.
  const liveMic = useLiveAudio({
    wsUrl: workspace ? liveSocketUrl(`/live/session/${workspace.id}`) : null,
    onUtterance: (text) => say(myName || "You", text),
  });
  const [liveOk, setLiveOk] = useState(true);
  useEffect(() => {
    if (liveMic.error) setLiveOk(false);
  }, [liveMic.error]);

  const speech =
    liveOk && liveMic.supported && workspace
      ? {
          supported: true,
          listening: liveMic.active,
          error: liveMic.error,
          interim: liveMic.caption,
          start: () => void liveMic.start(),
          stop: liveMic.stop,
        }
      : useRest
        ? restSpeech
        : browserSpeech;

  // The session is live once someone is actually talking (mic on, script
  // playing, or a transcript exists) - never merely because the page opened.
  const isLive =
    speech.listening || playUi !== "idle" || (workspace?.transcript.length ?? 0) > 0;
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  // ---- derived -----------------------------------------------------------

  const pages = workspace?.pages ?? [];
  const active = pages.find((p) => p.id === activeId) ?? pages[0];
  const activeArtifact = useMemo(() => (active ? asArtifact(active) : null), [active]);
  const pending = workspace?.pending_question ?? null;

  const speakers = useMemo(() => {
    // Real people first. The scripted personas appear only once the demo
    // script is actually contributing to this workspace's transcript.
    const names = new Set<string>();
    names.add(myName || "You");
    const scriptRunning =
      demoMode && (playUi !== "idle" || scriptProgress(workspace?.transcript ?? []) > 0);
    if (scriptRunning) Object.keys(SPEAKERS).forEach((n) => names.add(n));
    workspace?.transcript.forEach((t) => names.add(t.speaker));
    return [...names];
  }, [workspace, myName, playUi, demoMode]);

  /** How far through the script we are, derived from the server transcript. */
  const sent = scriptProgress(workspace?.transcript ?? []);

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
        {isLive ? (
          <span className={styles.livePill}>
            <span className={styles.liveDot} />
            LIVE {clockTime(elapsed)}
          </span>
        ) : (
          <span className={styles.kindChip}>READY</span>
        )}

        <span className={styles.barSpacer} />

        <div className={styles.tools}>
          {TOOLS.map((tool) => {
            // One Google connection powers every Workspace tool; the chips
            // reflect the live OAuth status, not a hardcoded list.
            const connected = googleConnected ?? tool.connected;
            return (
              <span
                key={tool.id}
                className={[styles.tool, !connected && styles.toolOff]
                  .filter(Boolean)
                  .join(" ")}
                title={connected ? "Connected to your Google account" : "Not connected"}
              >
                <Icon name={tool.icon} size={13} />
                {tool.label}
              </span>
            );
          })}
        </div>

        <Button
          variant="secondary"
          size="sm"
          leading={<Icon name="users" size={15} />}
          onClick={() => {
            void navigator.clipboard
              .writeText(window.location.href)
              .then(() => toast.show("Invite link copied — anyone who opens it joins this session"))
              .catch(() => toast.show(window.location.href));
          }}
        >
          Invite
        </Button>
      </header>

      {askName && (
        <div className={styles.nameGate} role="dialog" aria-label="Join the session">
          <form
            className={styles.nameCard}
            onSubmit={(e) => {
              e.preventDefault();
              const name = nameDraft.trim();
              if (!name) return;
              setGuestName(name);
              setMyName(name);
              setAskName(false);
            }}
          >
            <h2>Join the session</h2>
            <p>Pick the name teammates will see next to what you say.</p>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Your name"
              maxLength={40}
            />
            <Button variant="primary" type="submit" disabled={!nameDraft.trim()}>
              Join
            </Button>
          </form>
        </div>
      )}

      <div className={styles.body}>
        <main className={styles.stage}>
          <div className={styles.stageWrap}>
            {thinking && (
              <span className={styles.updateBadge}>
                <ShimmerLabel>Following the conversation…</ShimmerLabel>
              </span>
            )}
            {demoMode && sent === 0 && playUi === "idle" && !thinking && (
              <button
                type="button"
                className={styles.stagePlay}
                onClick={() => void runScript()}
              >
                <Icon name="play" size={17} />
                Run the meeting
              </button>
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
            <span className={styles.railTitle}>{showNotes ? "Notes" : "Session"}</span>
            <button
              type="button"
              className={[styles.whyBtn, showNotes && styles.notesOn].filter(Boolean).join(" ")}
              onClick={() => setShowNotes((v) => !v)}
            >
              {showNotes ? "Back to session" : "Notes"}
              {!showNotes && workspace.notes.length > 0 && (
                <span className={styles.notesCount}>{workspace.notes.length}</span>
              )}
            </button>
            {!showNotes && active.caused_by.length > 0 && (
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

          {/* The agent leading without interrupting: it raises a hand, and the
              suggestion is only spoken once a person allows it. Declining is
              remembered. */}
          {!showNotes && workspace.next_step && openedStep !== workspace.next_step && (
            <button
              type="button"
              className={styles.handRaise}
              onClick={() => setOpenedStep(workspace.next_step)}
            >
              <span className={styles.handBadge}>
                <Icon name="hand" size={13} />
              </span>
              Deckhand raised a hand
              <span className={styles.handHint}>let it speak</span>
            </button>
          )}
          {!showNotes && workspace.next_step && openedStep === workspace.next_step && (
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

          {!showNotes && (
          <div className={styles.feed}>
            {workspace.events.length === 0 && (
              <span className={styles.listening}>
                <Icon name={isLive ? "mic" : "micOff"} size={14} />
                {isLive
                  ? "Listening for the discussion…"
                  : "Session hasn't started — turn on the mic, type, or press play."}
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
                      {event.page_id && (
                        <button
                          type="button"
                          className={styles.jump}
                          onClick={() => setActiveId(event.page_id)}
                        >
                          {pages.find((p) => p.id === event.page_id)?.label ?? "page"}
                        </button>
                      )}
                      {event.link && (
                        <a className={styles.linkChip} href={event.link} download>
                          <Icon name="download" size={11} />
                          {event.link_label || "open file"}
                        </a>
                      )}
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
          )}

          {/* Everything a good facilitator would have written down. */}
          {showNotes && (
            <div className={styles.notesFull}>
              {workspace.notes.length === 0 && (
                <span className={styles.listening}>Nothing worth writing down yet.</span>
              )}
              {workspace.notes.map((note) => (
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
          )}

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
        {demoMode && sent < SCRIPT.length && playUi !== "awaiting" && (
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            aria-label={playUi === "running" ? "Pause the meeting" : "Play the meeting"}
            onClick={() => (playUi === "running" ? stopScript() : void runScript())}
            leading={<Icon name={playUi === "running" ? "stop" : "play"} size={16} />}
          />
        )}

        <div className={styles.callPeople}>
          {speakers.map((person) => {
            const talking =
              speakingN !== null &&
              SCRIPT.find((l) => l.n === speakingN)?.speaker === person;
            return (
              <span
                key={person}
                className={[styles.person, talking && styles.personSpeaking]
                  .filter(Boolean)
                  .join(" ")}
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
            );
          })}

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
                : isLive
                  ? "Deckhand is listening"
                  : "Deckhand is ready"}
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

