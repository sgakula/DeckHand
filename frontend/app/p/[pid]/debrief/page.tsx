"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { noteMeta } from "@/components/NoteKind";
import { PageHeader } from "@/components/PageHeader";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { clockTime, formatDateTime, plural, relativeTime } from "@/lib/format";
import { useAction, useResource } from "@/lib/hooks";
import type { NoteKind, TalkNote } from "@/lib/types";
import styles from "./debrief.module.css";

/** Most actionable first — questions and commitments are what you owe people. */
const GROUP_ORDER: NoteKind[] = [
  "audience_question",
  "commitment",
  "objection",
  "number_mismatch",
  "unsourced_claim",
  "rushed_section",
  "skipped_section",
];

export default function DebriefPage() {
  const { pid, presentation, talks, refreshTalks, deck } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const feedback = useAction();

  const [pickedTalkId, setPickedTalkId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Default to the most recent talk until the reader picks another one.
  const talk = talks?.find((t) => t.id === pickedTalkId) ?? talks?.[0] ?? null;
  const selectedTalkId = talk?.id ?? null;

  const profile = useResource((init) => api.getProfile(pid, init), [pid]);

  const grouped = useMemo(() => {
    const map = new Map<NoteKind, TalkNote[]>();
    for (const n of talk?.notes ?? []) {
      const list = map.get(n.kind) ?? [];
      list.push(n);
      map.set(n.kind, list);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      notes: (map.get(k) ?? []).sort((a, b) => a.at_seconds - b.at_seconds),
    }));
  }, [talk]);

  const durationSeconds =
    talk?.stopped_at && talk?.started_at
      ? (new Date(talk.stopped_at).getTime() - new Date(talk.started_at).getTime()) / 1000
      : 0;

  const sendFeedback = async (rating: "up" | "down") => {
    const result = await feedback.run(
      () =>
        api.submitFeedback(pid, deck?.version ?? presentation?.current_version ?? 1, [
          { slide_id: "", rating, note: note.trim() },
        ]),
      rating,
    );
    if (result) {
      setNote("");
      toast.success("Feedback sent — the profile updates in the background");
      setTimeout(() => profile.refresh(), 2500);
    }
  };

  if (!talks || talks.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Phase 3" title="Debrief" />
        <Card pad="none">
          <EmptyState
            icon={<Icon name="debrief" size={24} />}
            title="No talks yet"
            body="Once you present, everything the note-taker heard shows up here: questions you were asked, commitments you made, and what to change for next time."
            actions={
              <Button variant="primary" onClick={() => router.push(`/p/${pid}/present`)}>
                Go to present
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  const prefs = profile.data;
  const hasPrefs =
    prefs &&
    (prefs.structure_prefs.length > 0 ||
      prefs.style_prefs.length > 0 ||
      prefs.density_prefs.length > 0 ||
      prefs.recurring_questions.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Phase 3"
        title="Debrief"
        description="What the agent heard while you presented, and what it learned for the next version."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshTalks}
            leading={<Icon name="refresh" size={15} />}
          >
            Refresh
          </Button>
        }
      />

      <div className={styles.layout}>
        {talks.length > 1 && (
          <div className={styles.talkTabs}>
            {talks.map((t) => (
              <button
                key={t.id}
                type="button"
                className={[styles.talkTab, t.id === selectedTalkId && styles.talkTabActive]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setPickedTalkId(t.id)}
              >
                <span className={styles.talkTabDate}>{formatDateTime(t.started_at)}</span>
                <span className={styles.talkTabMeta}>
                  v{t.version} · {plural(t.notes.length, "note")}
                </span>
              </button>
            ))}
          </div>
        )}

        {talk && (
          <>
            <Card>
              <CardHeader
                title={`Talk on ${formatDateTime(talk.started_at)}`}
                subtitle={`Version ${talk.version} · started ${relativeTime(talk.started_at)}`}
                actions={
                  <Badge
                    tone={
                      talk.status === "processed"
                        ? "success"
                        : talk.status === "live"
                          ? "danger"
                          : "warning"
                    }
                    dot
                    live={talk.status === "live"}
                  >
                    {talk.status}
                  </Badge>
                }
              />
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {durationSeconds ? clockTime(durationSeconds) : "—"}
                  </span>
                  <span className={styles.statLabel}>Duration</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{talk.notes.length}</span>
                  <span className={styles.statLabel}>Notes</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {talk.notes.filter((n) => n.kind === "audience_question").length}
                  </span>
                  <span className={styles.statLabel}>Questions</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {talk.notes.filter((n) => n.kind === "commitment").length}
                  </span>
                  <span className={styles.statLabel}>Commitments</span>
                </div>
              </div>

              {talk.status === "stopped" && (
                <div style={{ marginTop: "var(--s4)" }}>
                  <Alert tone="info" title="Follow-up pipeline queued">
                    The worker exports to Slides, drafts the recap email, creates tasks, and
                    prepares suggested edits. Those steps need Google connected — until then the
                    talk stays at <strong>stopped</strong> and the notes below are all you get.
                  </Alert>
                </div>
              )}
            </Card>

            {grouped.length === 0 ? (
              <Card pad="none">
                <EmptyState
                  icon={<Icon name="debrief" size={22} />}
                  title="No notes from this talk"
                  body="The note-taker only writes something down when it hears a question, a commitment, an objection, or a number that does not match your sources."
                  compact
                />
              </Card>
            ) : (
              <div className={styles.groups}>
                {grouped.map(({ kind, notes }) => {
                  const meta = noteMeta(kind);
                  return (
                    <div key={kind} className={styles.group}>
                      <div className={styles.groupHead}>
                        <Icon name={meta.icon} size={16} />
                        {meta.label}
                        <Badge tone={meta.tone}>{notes.length}</Badge>
                      </div>
                      {notes.map((n, i) => (
                        <div
                          key={i}
                          className={styles.note}
                          style={{ animationDelay: `${Math.min(i, 6) * 25}ms` }}
                        >
                          <Icon name={meta.icon} size={17} className={styles.noteIcon} />
                          <div className={styles.noteBody}>
                            <div className={styles.noteText}>{n.text}</div>
                            <div className={styles.noteMeta}>
                              <span>{clockTime(n.at_seconds)}</span>
                              {n.slide_id && (
                                <>
                                  <span>·</span>
                                  <span>{n.slide_id}</span>
                                </>
                              )}
                              {n.answered === false && <Badge tone="warning">Unanswered</Badge>}
                              {n.answered === true && <Badge tone="success">Answered</Badge>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {talk.transcript.length > 0 && (
              <Card>
                <CardHeader
                  title="Transcript"
                  subtitle={`${plural(talk.transcript.length, "window")} captured`}
                />
                <div className={styles.transcript}>
                  {talk.transcript.map((chunk, i) => (
                    <p key={i} className={styles.chunk}>
                      {chunk}
                    </p>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        <Card>
          <CardHeader
            title="How did this deck do?"
            subtitle="Feeds the preference profile, so the next deck starts closer to what you want."
          />
          <div className={styles.feedbackRow}>
            <div className={styles.feedbackInput}>
              <Input
                value={note}
                placeholder="e.g. fewer metric slides, open with a story"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className={styles.ratingGroup}>
              <Button
                variant="secondary"
                onClick={() => sendFeedback("up")}
                pending={feedback.isPending("up")}
                leading={<Icon name="thumbUp" size={16} />}
              >
                Worked
              </Button>
              <Button
                variant="secondary"
                onClick={() => sendFeedback("down")}
                pending={feedback.isPending("down")}
                leading={<Icon name="thumbDown" size={16} />}
              >
                Change it
              </Button>
            </div>
          </div>
          {feedback.error && (
            <div style={{ marginTop: "var(--s3)" }}>
              <Alert tone="danger">{feedback.error}</Alert>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="What Deckhand has learned"
            subtitle="Applied automatically the next time you build a deck"
            actions={
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Refresh profile"
                onClick={profile.refresh}
                leading={<Icon name="refresh" size={15} />}
              />
            }
          />
          {!hasPrefs ? (
            <p style={{ fontSize: "var(--text-base)", color: "var(--text-tertiary)" }}>
              Nothing learned yet. Send feedback above and it will start remembering how you like
              your decks built.
            </p>
          ) : (
            <div>
              {[
                ["Structure", prefs.structure_prefs] as const,
                ["Style", prefs.style_prefs] as const,
                ["Density", prefs.density_prefs] as const,
                ["Recurring questions", prefs.recurring_questions] as const,
              ]
                .filter(([, items]) => items.length > 0)
                .map(([label, items]) => (
                  <div key={label} className={styles.prefGroup}>
                    <span className={styles.prefLabel}>{label}</span>
                    <div className={styles.prefItems}>
                      {items.map((item) => (
                        <Badge key={item} tone="neutral" pill>
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
