"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactFrame } from "@/components/workspace/ArtifactFrame";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ShimmerLabel } from "@/components/ui/Generating";
import { clockTime } from "@/lib/format";
import { withViewTransition } from "@/lib/viewTransition";
import {
  INITIAL_PAGES,
  PARTICIPANTS,
  SESSION_SCRIPT,
  TOOLS,
  WORKSPACE_KIND_LABEL,
  type FeedItem,
  type Page,
  type ToolId,
} from "@/lib/session";
import type { Artifact } from "@/lib/artifacts";
import styles from "./workspace.module.css";

const TOOL_ICON: Record<ToolId, IconName> = {
  gmail: "brief",
  drive: "sources",
  calendar: "clock",
  sheets: "chart",
  slides: "deck",
};

const personById = (id: string) => PARTICIPANTS.find((p) => p.id === id) ?? PARTICIPANTS[0];

/** Wraps a page's markup in the shape ArtifactFrame renders. */
function asArtifact(page: Page): Artifact {
  return {
    id: page.id,
    title: page.label,
    kind: "slide",
    aspect: 16 / 9,
    body: page.body,
    state: "ready",
    version: 1,
    updatedAt: "",
    updatedBy: "you",
  };
}

/**
 * Plays the scripted session: speech lands in the feed, and when the agent acts
 * it patches the artifact on the stage. This is where a Gemini Live socket will
 * plug in — the shape of the state it produces is already what the UI consumes.
 */
function useLiveSession(onPatch: (pageId: string, body: string) => void) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [busyTool, setBusyTool] = useState<ToolId | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Kept in a ref so the scripted playback below never restarts when the
  // callback identity changes. Assigned in an effect, not during render.
  const patchRef = useRef(onPatch);
  useEffect(() => {
    patchRef.current = onPatch;
  });

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const play = (index: number) => {
      if (cancelled || index >= SESSION_SCRIPT.length) return;
      const beat = SESSION_SCRIPT[index];

      timers.push(
        setTimeout(() => {
          if (cancelled) return;

          if (beat.item.kind === "speech") {
            setFeed((f) => [...f, beat.item]);
            setSpeakerId(beat.item.speakerId);
            // Stop the meter a beat after the line lands.
            timers.push(setTimeout(() => !cancelled && setSpeakerId(null), 2200));
          } else {
            const action = beat.item;
            setSpeakerId(null);
            setBusyTool(action.tool ?? null);
            setEditingPageId(action.pageId);

            // Let the "rewriting this" state read before the artifact swaps.
            timers.push(
              setTimeout(() => {
                if (cancelled) return;
                if (beat.patch) {
                  withViewTransition(() => patchRef.current(beat.patch!.pageId, beat.patch!.body));
                }
                setFeed((f) => [...f, action]);
                setEditingPageId(null);
                setBusyTool(null);
              }, 1400),
            );
          }

          play(index + 1);
        }, beat.after),
      );
    };

    play(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return { feed, speakerId, busyTool, editingPageId, elapsed };
}

export default function WorkspacePage() {
  const [name, setName] = useState("Series B pitch");
  const [pages, setPages] = useState<Page[]>(INITIAL_PAGES);
  const [activeId, setActiveId] = useState("p1");
  const [micOn, setMicOn] = useState(true);
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const feedEnd = useRef<HTMLDivElement>(null);

  const patch = useCallback((pageId: string, body: string) => {
    setPages((cur) => cur.map((p) => (p.id === pageId ? { ...p, body } : p)));
    setEdited((cur) => new Set(cur).add(pageId));
    setActiveId(pageId);
  }, []);

  const { feed, speakerId, busyTool, editingPageId, elapsed } = useLiveSession(patch);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [feed]);

  const active = pages.find((p) => p.id === activeId) ?? pages[0];
  const activeArtifact = useMemo(() => asArtifact(active), [active]);
  const isEditingActive = editingPageId === active.id;

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href="/" className={styles.back} aria-label="All workspaces">
          <Icon name="arrowLeft" size={17} />
        </Link>
        <input
          className={styles.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Workspace name"
        />
        <span className={styles.kindChip}>{WORKSPACE_KIND_LABEL.presentation}</span>
        <span className={styles.livePill}>
          <span className={styles.liveDot} />
          LIVE {clockTime(elapsed)}
        </span>

        <span className={styles.barSpacer} />

        {/* What the agent can reach. Lights up the moment it uses one. */}
        <div className={styles.tools}>
          {TOOLS.map((tool) => (
            <span
              key={tool.id}
              className={[
                styles.tool,
                !tool.connected && styles.toolOff,
                busyTool === tool.id && styles.toolActive,
              ]
                .filter(Boolean)
                .join(" ")}
              title={tool.connected ? tool.detail : `${tool.label} — not connected`}
            >
              <Icon name={TOOL_ICON[tool.id]} size={13} />
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
            {isEditingActive && (
              <span className={styles.updateBadge}>
                <ShimmerLabel>Rewriting this slide…</ShimmerLabel>
              </span>
            )}
            <div
              className={[styles.renderer, isEditingActive && styles.rendererLive]
                .filter(Boolean)
                .join(" ")}
            >
              <ArtifactFrame artifact={activeArtifact} logicalWidth={1400} />
            </div>
          </div>

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
                {edited.has(page.id) && <span className={styles.frameEdited} />}
                <span className={styles.frameLabel}>{page.label}</span>
              </button>
            ))}
            <button type="button" className={styles.addFrame} aria-label="Add a slide">
              <Icon name="plus" size={18} />
            </button>
          </div>
        </main>

        <aside className={styles.rail}>
          <div className={styles.railHead}>
            <span className={styles.railTitle}>Session</span>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Session history"
              leading={<Icon name="versions" size={16} />}
            />
          </div>

          <div className={styles.feed}>
            {feed.length === 0 && (
              <span className={styles.listening}>
                <Icon name="mic" size={14} />
                Listening for the discussion…
              </span>
            )}

            {feed.map((item) =>
              item.kind === "speech" ? (
                <div key={item.id} className={styles.speech}>
                  <span
                    className={styles.speechAvatar}
                    style={{ background: personById(item.speakerId).color }}
                  >
                    {personById(item.speakerId).initials}
                  </span>
                  <span className={styles.speechBody}>
                    <span
                      className={styles.speechName}
                      style={{ color: personById(item.speakerId).color }}
                    >
                      {personById(item.speakerId).name}
                    </span>
                    <span className={styles.speechText}>{item.text}</span>
                  </span>
                </div>
              ) : (
                <div key={item.id} className={styles.action}>
                  <Icon name="sparkle" size={15} className={styles.actionIcon} />
                  <span className={styles.actionBody}>
                    <span className={styles.actionText}>{item.summary}</span>
                    <span className={styles.actionMeta}>
                      {item.tool && (
                        <>
                          <Icon name={TOOL_ICON[item.tool]} size={12} />
                          {TOOLS.find((t) => t.id === item.tool)?.label}
                          <span>·</span>
                        </>
                      )}
                      <button
                        type="button"
                        className={styles.jump}
                        onClick={() => setActiveId(item.pageId)}
                      >
                        {pages.find((p) => p.id === item.pageId)?.label}
                      </button>
                    </span>
                  </span>
                </div>
              ),
            )}

            {editingPageId && (
              <span className={styles.listening}>
                <ShimmerLabel>Working on it…</ShimmerLabel>
              </span>
            )}

            <div ref={feedEnd} />
          </div>
        </aside>
      </div>

      <footer className={styles.callBar}>
        <Button
          variant={micOn ? "secondary" : "danger"}
          size="sm"
          iconOnly
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          onClick={() => setMicOn((m) => !m)}
          leading={<Icon name={micOn ? "mic" : "micOff"} size={16} />}
        />

        <div className={styles.callPeople}>
          {PARTICIPANTS.map((person) => {
            const speaking = speakerId === person.id;
            return (
              <span
                key={person.id}
                className={[styles.person, speaking && styles.personSpeaking]
                  .filter(Boolean)
                  .join(" ")}
                style={{ ["--speaker-color" as string]: person.color }}
              >
                <span className={styles.personAvatar} style={{ background: person.color }}>
                  {person.initials}
                </span>
                <span className={styles.personName}>{person.name}</span>
                {person.listening ? (
                  <Icon name="micOff" size={13} className={styles.mutedIcon} />
                ) : (
                  <span className={styles.meter} aria-hidden>
                    <span className={styles.meterBar} />
                    <span className={styles.meterBar} />
                    <span className={styles.meterBar} />
                    <span className={styles.meterBar} />
                  </span>
                )}
              </span>
            );
          })}

          <span className={styles.agentChip}>
            <span className={styles.agentWave} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Deckhand is listening
          </span>
        </div>

        <div className={styles.callActions}>
          <Button variant="secondary" size="sm" leading={<Icon name="download" size={15} />}>
            Export
          </Button>
          <Button variant="danger" size="sm">
            Leave
          </Button>
        </div>
      </footer>
    </div>
  );
}
