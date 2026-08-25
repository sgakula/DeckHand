"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ShimmerLabel } from "@/components/ui/Generating";
import { Icon } from "@/components/ui/Icon";
import { Alert, LoadingBlock } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import type { PresentationBrief } from "@/lib/types";
import styles from "./brief.module.css";

interface Turn {
  role: "user" | "agent";
  text: string;
}

const STARTERS = [
  "I'm pitching to seed investors for 10 minutes. I want a follow-up meeting.",
  "Quarterly business review for my exec team, 20 minutes, keep it data-heavy.",
  "Conference talk for engineers, 30 minutes, I want them to try the product.",
];

function BriefField({
  label,
  value,
  filled,
}: {
  label: string;
  value: React.ReactNode;
  filled: boolean;
}) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>
        {filled ? (
          <Icon name="checkCircle" size={13} style={{ color: "var(--success)" }} />
        ) : (
          <Icon name="info" size={13} style={{ opacity: 0.5 }} />
        )}
        {label}
      </span>
      <span className={[styles.fieldValue, !filled && styles.fieldEmpty].filter(Boolean).join(" ")}>
        {filled ? value : "Not captured yet"}
      </span>
    </div>
  );
}

function BriefPanel({ brief }: { brief: PresentationBrief }) {
  return (
    <div className={styles.fields}>
      <BriefField label="Audience" value={brief.audience} filled={Boolean(brief.audience)} />
      <BriefField
        label="Duration"
        value={`${brief.duration_minutes} minutes`}
        filled={brief.duration_minutes > 0}
      />
      <BriefField
        label="Desired outcome"
        value={brief.desired_outcome}
        filled={Boolean(brief.desired_outcome)}
      />
      <BriefField label="Tone" value={brief.tone} filled={Boolean(brief.tone)} />
      <BriefField
        label="Must include"
        value={
          <span className={styles.tagRow}>
            {brief.must_include.map((m) => (
              <Badge key={m} tone="neutral">
                {m}
              </Badge>
            ))}
          </span>
        }
        filled={brief.must_include.length > 0}
      />
      <BriefField
        label="Must avoid"
        value={
          <span className={styles.tagRow}>
            {brief.must_avoid.map((m) => (
              <Badge key={m} tone="warning">
                {m}
              </Badge>
            ))}
          </span>
        }
        filled={brief.must_avoid.length > 0}
      />
      <BriefField
        label="Attendees"
        value={
          <span className={styles.tagRow}>
            {brief.attendee_emails.map((m) => (
              <Badge key={m} tone="accent">
                {m}
              </Badge>
            ))}
          </span>
        }
        filled={brief.attendee_emails.length > 0}
      />
    </div>
  );
}

export default function BriefPage() {
  const { pid, presentation, setPresentation, refreshPresentation } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const action = useAction();

  const [appended, setAppended] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const threadEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const history = useResource((init) => api.interviewHistory(pid, init), [pid]);

  // The thread is server history plus whatever this session has sent since —
  // history is fetched once per presentation, so nothing is double-counted.
  const turns = useMemo<Turn[]>(() => {
    const fromServer: Turn[] = (history.data ?? [])
      .filter((e) => e.text)
      .map((e) => ({ role: e.role === "user" ? "user" : "agent", text: e.text as string }));
    return [...fromServer, ...appended];
  }, [history.data, appended]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, action.pending]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || action.pending) return;
    setDraft("");
    setAppended((t) => [...t, { role: "user", text: message }]);

    const reply = await action.run(() => api.sendInterviewMessage(pid, message));
    if (!reply) return;

    setAppended((t) => [...t, { role: "agent", text: reply.reply }]);
    if (presentation) setPresentation({ ...presentation, brief: reply.brief });
    if (reply.complete) toast.success("Brief complete — you can propose an outline");
  };

  const brief = presentation?.brief;
  const complete = Boolean(brief?.complete);

  return (
    <>
      <PageHeader
        eyebrow="Phase 1"
        title="Brief"
        description="The intake agent asks one question at a time until it knows your audience, your time budget, the decision you want, and your tone. Anything it already knows from past sessions it skips."
        actions={
          complete ? (
            <Badge tone="success" dot>
              Complete
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              In progress
            </Badge>
          )
        }
      />

      <div className={styles.layout}>
        <div className={styles.chat}>
          {history.loading ? (
            <LoadingBlock label="Loading conversation…" />
          ) : (
            <div className={styles.thread}>
              {turns.length === 0 && (
                <div className={`${styles.turn} ${styles.agentTurn}`}>
                  <span className={styles.avatar}>
                    <Icon name="sparkle" size={15} />
                  </span>
                  <div className={styles.agentBody}>
                    <div className={styles.agentName}>Intake agent</div>
                    <div className={styles.agentText}>
                      Tell me about this talk — who are you presenting to, how long do you have,
                      and what do you want them to do afterwards?
                    </div>
                    <div className={styles.starters}>
                      {STARTERS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={styles.starter}
                          onClick={() => void send(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {turns.map((t, i) =>
                t.role === "agent" ? (
                  <div key={i} className={`${styles.turn} ${styles.agentTurn}`}>
                    <span className={styles.avatar}>
                      <Icon name="sparkle" size={15} />
                    </span>
                    <div className={styles.agentBody}>
                      <div className={styles.agentName}>Intake agent</div>
                      <div className={styles.agentText}>{t.text}</div>
                    </div>
                  </div>
                ) : (
                  <div key={i} className={`${styles.turn} ${styles.userTurn}`}>
                    <div className={styles.userBubble}>{t.text}</div>
                  </div>
                ),
              )}

              {action.pending && (
                <div className={`${styles.turn} ${styles.agentTurn}`}>
                  <span className={styles.avatar}>
                    <Icon name="sparkle" size={15} />
                  </span>
                  <div className={styles.thinking}>
                    <ShimmerLabel icon={false}>Thinking through your answer</ShimmerLabel>
                  </div>
                </div>
              )}

              <div ref={threadEnd} />
            </div>
          )}

          {action.error && (
            <Alert
              tone="danger"
              title="The agent could not reply"
              actions={
                <Button size="sm" variant="secondary" onClick={action.clearError}>
                  Dismiss
                </Button>
              }
            >
              {action.error}
            </Alert>
          )}

          <div className={styles.composer}>
            <div className={styles.composerInner}>
              <textarea
                ref={inputRef}
                className={styles.composerInput}
                rows={1}
                value={draft}
                placeholder="Answer the agent…"
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
              />
              <Button
                variant="primary"
                iconOnly
                aria-label="Send"
                disabled={!draft.trim()}
                pending={action.pending}
                onClick={() => void send(draft)}
                leading={<Icon name="send" size={16} />}
              />
            </div>
            <div className={styles.composerHint}>
              Enter to send · Shift + Enter for a new line
            </div>
          </div>
        </div>

        <aside className={styles.panel}>
          <Card>
            <CardHeader
              title="Brief"
              subtitle="Filled in by the agent as you talk"
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Refresh brief"
                  onClick={refreshPresentation}
                  leading={<Icon name="refresh" size={15} />}
                />
              }
            />
            {brief ? <BriefPanel brief={brief} /> : <LoadingBlock label="" size={18} />}
          </Card>

          {complete && (
            <Card>
              <div className={styles.nextStep}>
                <CardHeader
                  title="Ready for an outline"
                  subtitle="The planner will draft sections from this brief and any facts you connect."
                />
                <Button
                  variant="primary"
                  onClick={() => router.push(`/p/${pid}/outline`)}
                  trailing={<Icon name="arrowRight" size={16} />}
                >
                  Go to outline
                </Button>
                <Button variant="ghost" size="sm" onClick={() => router.push(`/p/${pid}/sources`)}>
                  Connect data sources first
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
