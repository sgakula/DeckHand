"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { humanizeId, plural } from "@/lib/format";
import { useAction, usePoll, useResource } from "@/lib/hooks";
import type { DryRunProblem } from "@/lib/types";
import styles from "./rehearse.module.css";

const PROBLEM_LABEL: Record<DryRunProblem["kind"], string> = {
  missing_section: "Missing section",
  unsourced_claim: "Unsourced number",
  overtime: "Over time budget",
};

export default function RehearsePage() {
  const { pid, presentation, deck, lockedVersion, refreshDeck, refreshAll } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const lock = useAction();
  const approveAll = useAction();

  const [exportJobId, setExportJobId] = useState<string | null>(null);

  const dryRun = useResource((init) => api.dryRun(pid, init), [pid, deck?.slides.length]);

  const job = usePoll(() => api.getJob(exportJobId as string), {
    active: Boolean(exportJobId),
    intervalMs: 2000,
    done: (j) => j.status === "done" || j.status === "error",
  });

  const slides = useMemo(() => deck?.slides ?? [], [deck]);
  const sections = presentation?.outline.sections ?? [];
  const budget = presentation?.brief.duration_minutes ?? 10;
  const locked = Boolean(deck?.locked);

  const slidesPerSection = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slides) map.set(s.section_id, (map.get(s.section_id) ?? 0) + 1);
    return map;
  }, [slides]);

  const plannedTotal = sections.reduce((sum, s) => sum + s.est_minutes, 0);
  const unapproved = dryRun.data?.unapproved_slides ?? [];
  const problems = dryRun.data?.problems ?? [];
  const ready = Boolean(dryRun.data?.ready);

  const runApproveAll = async () => {
    for (const id of unapproved) {
      const ok = await approveAll.run(() => api.approveSlide(pid, id), "all");
      if (!ok) break;
    }
    refreshDeck();
    dryRun.refresh();
    toast.success("All slides approved");
  };

  const runLock = async () => {
    const result = await lock.run(() => api.lockDeck(pid));
    if (result) {
      setExportJobId(result.export_job);
      refreshAll();
      toast.success(`Locked version ${result.version}`);
    }
  };

  if (slides.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Phase 1" title="Rehearse" />
        <Card pad="none">
          <EmptyState
            icon={<Icon name="rehearse" size={24} />}
            title="Nothing to check yet"
            body="Build some slides and the dry run will check timing, coverage, and whether every number on the deck can be traced back to a source."
            actions={
              <Button variant="primary" onClick={() => router.push(`/p/${pid}/deck`)}>
                Go to deck
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
        eyebrow="Phase 2"
        title="Rehearse"
        description="Deterministic pre-flight checks before you lock. Locking freezes the deck as an immutable version and queues the Slides export as a backup."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dryRun.refresh()}
            pending={dryRun.refreshing}
            leading={<Icon name="refresh" size={15} />}
          >
            Re-run
          </Button>
        }
      />

      {dryRun.loading ? (
        <LoadingBlock label="Running checks…" />
      ) : dryRun.error ? (
        <Alert tone="danger" title="Could not run the checks">
          {dryRun.error}
        </Alert>
      ) : (
        <div className={styles.layout}>
          <Card className={ready ? styles.ready : styles.notReady}>
            <div className={styles.verdict}>
              <span className={styles.verdictIcon}>
                <Icon name={ready ? "checkCircle" : "warning"} size={26} />
              </span>
              <div className={styles.verdictText}>
                <div className={styles.verdictTitle}>
                  {locked
                    ? `Version ${deck?.version} is locked`
                    : ready
                      ? "Ready to lock"
                      : problems.length === 0
                        ? `${plural(unapproved.length, "slide")} still need approval`
                        : `${plural(problems.length, "problem")} to resolve`}
                </div>
                <div className={styles.verdictSub}>
                  {locked
                    ? "The deck is frozen. You can present it now."
                    : ready
                      ? "Every section has slides, every number has a source, and every slide is approved."
                      : "The deck can only be locked once these are cleared."}
                </div>
              </div>
              {locked ? (
                <Button
                  variant="primary"
                  onClick={() => router.push(`/p/${pid}/present`)}
                  trailing={<Icon name="arrowRight" size={16} />}
                >
                  Go present
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!ready}
                  pending={lock.pending}
                  onClick={runLock}
                  leading={<Icon name="lock" size={17} />}
                >
                  Lock deck
                </Button>
              )}
            </div>

            {lock.error && (
              <div style={{ marginTop: "var(--s4)" }}>
                <Alert tone="danger" title="Could not lock the deck">
                  {lock.error}
                </Alert>
              </div>
            )}

            {/* Reopening a locked deck starts a fresh draft, so you can be looking
                at an unlocked v(n+1) while v(n) is already presentable. */}
            {!locked && lockedVersion && (
              <div style={{ marginTop: "var(--s4)" }}>
                <Alert
                  tone="info"
                  title={`Version ${lockedVersion.version} is already locked`}
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/p/${pid}/present`)}
                    >
                      Present v{lockedVersion.version}
                    </Button>
                  }
                >
                  This is draft v{deck?.version}, created when you reopened the deck. Locking it
                  makes a new version; the locked one stays as it is.
                </Alert>
              </div>
            )}

            {exportJobId && (
              <div style={{ marginTop: "var(--s4)" }}>
                <div className={styles.jobRow}>
                  <Badge
                    tone={
                      job?.status === "done"
                        ? "success"
                        : job?.status === "error"
                          ? "danger"
                          : "accent"
                    }
                    dot
                    live={!job || (job.status !== "done" && job.status !== "error")}
                  >
                    Export {job?.status ?? "queued"}
                  </Badge>
                  <span>Google Slides export job {exportJobId.slice(0, 8)}</span>
                </div>
                {job?.steps_done && job.steps_done.length > 0 && (
                  <div className={styles.steps}>
                    {job.steps_done.map((s) => (
                      <Badge key={s} tone="neutral">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {job?.status === "error" && (
                  <div style={{ marginTop: "var(--s3)" }}>
                    <Alert tone="warning" title="The export job failed">
                      {job.error || "The worker could not finish the export."} The deck itself is
                      still locked and safe.
                    </Alert>
                  </div>
                )}
              </div>
            )}
          </Card>

          {problems.length > 0 && (
            <Card>
              <CardHeader
                title="Problems"
                subtitle="Found by the deterministic dry-run, not by a model"
              />
              <div className={styles.problems}>
                {problems.map((p, i) => (
                  <div key={i} className={styles.problem} style={{ animationDelay: `${i * 30}ms` }}>
                    <Icon name="warning" size={16} className={styles.problemIcon} />
                    <div className={styles.problemBody}>
                      <div className={styles.problemDetail}>{p.detail}</div>
                      <div className={styles.problemKind}>
                        {PROBLEM_LABEL[p.kind] ?? p.kind}
                        {p.ref && ` · ${humanizeId(p.ref)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {unapproved.length > 0 && (
            <Card>
              <CardHeader
                title={`${plural(unapproved.length, "slide")} not approved`}
                subtitle="Every slide needs a human sign-off before the deck can lock."
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={runApproveAll}
                    pending={approveAll.pending}
                    leading={<Icon name="check" size={15} />}
                  >
                    Approve all
                  </Button>
                }
              />
              <div className={styles.slideChips}>
                {unapproved.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={styles.slideChip}
                    onClick={() => router.push(`/p/${pid}/deck`)}
                  >
                    <Icon name="deck" size={13} />
                    {id}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Timing"
              subtitle={`Planned against your ${budget}-minute budget`}
            />
            <div className={styles.timing}>
              {sections.map((s) => {
                const count = slidesPerSection.get(s.id) ?? 0;
                return (
                  <div
                    key={s.id}
                    className={[styles.timingRow, count === 0 && styles.timingNoSlides]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className={styles.timingName} title={s.title}>
                      {s.title}
                    </span>
                    <span className={styles.timingBar}>
                      <span
                        className={styles.timingFill}
                        style={{ width: `${Math.min(100, (s.est_minutes / Math.max(budget, 1)) * 100)}%` }}
                      />
                    </span>
                    <span className={styles.timingValue}>
                      {count === 0 ? "—" : `${s.est_minutes}m`}
                    </span>
                  </div>
                );
              })}
              <div className={styles.timingTotal}>
                <span>Total planned</span>
                <span className={styles.totalValue}>
                  {plannedTotal.toFixed(0)} of {budget} min
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
