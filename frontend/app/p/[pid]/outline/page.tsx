"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { Outline, OutlineSection } from "@/lib/types";
import styles from "./outline.module.css";

const slug = (title: string, fallback: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || fallback;

export default function OutlinePage() {
  const { pid, presentation, setPresentation } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const propose = useAction();
  const save = useAction();

  const serverOutline = presentation?.outline;
  // null means "no local edits" — render the server's sections directly, so there
  // is no copy to keep in sync and no effect to do the syncing.
  const [edited, setEdited] = useState<OutlineSection[] | null>(null);
  const draft = useMemo(
    () => edited ?? serverOutline?.sections ?? [],
    [edited, serverOutline],
  );
  const dirty = edited !== null;

  const approved = Boolean(serverOutline?.approved);
  const briefComplete = Boolean(presentation?.brief.complete);
  const budget = presentation?.brief.duration_minutes ?? 10;
  const planned = useMemo(
    () => draft.reduce((sum, s) => sum + (Number(s.est_minutes) || 0), 0),
    [draft],
  );
  const over = planned > budget * 1.15;

  const update = (index: number, patch: Partial<OutlineSection>) => {
    setEdited(draft.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setEdited(next.map((s, i) => ({ ...s, order: i })));
  };

  const remove = (index: number) => {
    setEdited(draft.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  };

  const add = () => {
    setEdited([
      ...draft,
      {
        id: `section_${draft.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        title: "New section",
        key_claim: "",
        supporting_facts: [],
        est_minutes: 2,
        order: draft.length,
      },
    ]);
  };

  const runPropose = async () => {
    const result = await propose.run(() => api.proposeOutline(pid));
    if (result && presentation) {
      setPresentation({ ...presentation, outline: result });
      setEdited(null);
      toast.success(`Proposed ${plural(result.sections.length, "section")}`);
    }
  };

  const runSave = async () => {
    const payload: Outline = {
      sections: draft.map((s, i) => ({
        ...s,
        order: i,
        id: s.id || slug(s.title, `section_${i + 1}`),
        est_minutes: Number(s.est_minutes) || 0,
      })),
      approved: false,
      approved_at: null,
    };
    const result = await save.run(() => api.updateOutline(pid, payload), "save");
    if (result && presentation) {
      setPresentation({ ...presentation, outline: result });
      setEdited(null);
      toast.success("Outline saved");
    }
  };

  const runApprove = async () => {
    if (dirty) {
      await runSave();
    }
    const result = await save.run(() => api.approveOutline(pid), "approve");
    if (result && presentation) {
      setPresentation({ ...presentation, outline: result });
      setEdited(null);
      toast.success("Outline approved — you can build the deck");
    }
  };

  // ---- gates ----

  if (!briefComplete) {
    return (
      <>
        <PageHeader eyebrow="Phase 1" title="Outline" />
        <Card pad="none">
          <EmptyState
            icon={<Icon name="lock" size={24} />}
            title="Finish the brief first"
            body="The planner needs to know your audience, time budget, and desired outcome before it can propose a structure."
            actions={
              <Button variant="primary" onClick={() => router.push(`/p/${pid}/brief`)}>
                Go to brief
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Phase 1"
        title="Outline"
        description="Sections the planner drafted from your brief and connected facts. Edit anything here — once you approve, this becomes the contract the slide builder works from."
        actions={
          approved ? (
            <Badge tone="success" dot>
              Approved
            </Badge>
          ) : draft.length > 0 ? (
            <Badge tone="warning" dot>
              Draft
            </Badge>
          ) : undefined
        }
      />

      {draft.length === 0 ? (
        <Card pad="none">
          <EmptyState
            icon={<Icon name="outline" size={24} />}
            title="No outline yet"
            body="The planner will propose sections from your brief, pulling in any facts you connected as supporting evidence."
            actions={
              <Button
                variant="primary"
                onClick={runPropose}
                pending={propose.pending}
                leading={<Icon name="sparkle" size={17} />}
              >
                Propose outline
              </Button>
            }
          />
          {propose.error && (
            <div style={{ padding: "0 var(--s6) var(--s6)" }}>
              <Alert tone="danger" title="Could not propose an outline">
                {propose.error}
              </Alert>
            </div>
          )}
        </Card>
      ) : (
        <div className={styles.layout}>
          <Card>
            <div className={styles.budget}>
              <div className={styles.budgetText}>
                <span className={styles.budgetValue}>
                  {planned.toFixed(0)} / {budget} min
                </span>
                <span className={styles.budgetLabel}>
                  {plural(draft.length, "section")} planned
                </span>
              </div>
              <div className={styles.budgetBar}>
                <div
                  className={[styles.budgetFill, over && styles.budgetOver].filter(Boolean).join(" ")}
                  style={{ width: `${Math.min(100, (planned / Math.max(budget, 1)) * 100)}%` }}
                />
              </div>
              {over && <Badge tone="warning">Over budget</Badge>}
            </div>
          </Card>

          {(propose.error || save.error) && (
            <Alert tone="danger" title="Something went wrong">
              {propose.error ?? save.error}
            </Alert>
          )}

          <div className={styles.sections}>
            {draft.map((section, i) => (
              <div key={section.id || i} className={styles.section} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <span className={styles.ordinal}>{i + 1}</span>
                <Card className={styles.card}>
                  <div className={styles.cardHead}>
                    <input
                      className={styles.titleInput}
                      value={section.title}
                      disabled={approved}
                      placeholder="Section title"
                      onChange={(e) => update(i, { title: e.target.value })}
                    />
                  </div>

                  <textarea
                    className={styles.claimInput}
                    value={section.key_claim}
                    disabled={approved}
                    rows={2}
                    placeholder="The one claim this section has to land…"
                    onChange={(e) => update(i, { key_claim: e.target.value })}
                  />

                  {section.supporting_facts.length > 0 && (
                    <div className={styles.facts}>
                      {section.supporting_facts.map((f, j) => (
                        <div key={j} className={styles.factLine}>
                          {f.value && <span className={styles.factVal}>{f.value}</span>}
                          <span>{f.fact}</span>
                          {f.source_ref && <span className={styles.factRef}>{f.source_ref}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={styles.cardMeta}>
                    {approved ? (
                      <span className={styles.minutes}>
                        <Icon name="clock" size={14} />
                        {section.est_minutes} min
                      </span>
                    ) : (
                      <label className={styles.minutes}>
                        <Icon name="clock" size={14} />
                        <input
                          className={styles.minutesInput}
                          type="number"
                          min={0}
                          step={0.5}
                          value={section.est_minutes}
                          onChange={(e) => update(i, { est_minutes: Number(e.target.value) })}
                        />
                        min
                      </label>
                    )}
                    <span className={styles.metaSpacer} />
                    {!approved && (
                      <div className={styles.rowActions}>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          leading={<Icon name="chevronDown" size={15} style={{ transform: "rotate(180deg)" }} />}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="Move down"
                          disabled={i === draft.length - 1}
                          onClick={() => move(i, 1)}
                          leading={<Icon name="chevronDown" size={15} />}
                        />
                        <Button
                          variant="dangerGhost"
                          size="sm"
                          iconOnly
                          aria-label="Remove section"
                          onClick={() => remove(i)}
                          leading={<Icon name="trash" size={15} />}
                        />
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            ))}
          </div>

          {!approved && (
            <div>
              <Button variant="secondary" onClick={add} leading={<Icon name="plus" size={16} />}>
                Add section
              </Button>
            </div>
          )}

          <div className={styles.footer}>
            <span className={styles.footerText}>
              {approved
                ? "Approved. The builder now works section by section from this outline."
                : dirty
                  ? "You have unsaved edits."
                  : "Approving locks the structure and unlocks the deck builder."}
            </span>
            <div className={styles.footerActions}>
              {!approved && (
                <>
                  <Button
                    variant="ghost"
                    onClick={runPropose}
                    pending={propose.pending}
                    leading={<Icon name="refresh" size={15} />}
                  >
                    Re-propose
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={runSave}
                    disabled={!dirty}
                    pending={save.isPending("save")}
                  >
                    Save
                  </Button>
                  <Button
                    variant="primary"
                    onClick={runApprove}
                    pending={save.isPending("approve")}
                    leading={<Icon name="check" size={16} />}
                  >
                    Approve outline
                  </Button>
                </>
              )}
              {approved && (
                <Button
                  variant="primary"
                  onClick={() => router.push(`/p/${pid}/deck`)}
                  trailing={<Icon name="arrowRight" size={16} />}
                >
                  Build the deck
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
