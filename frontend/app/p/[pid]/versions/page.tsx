"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { plural, relativeTime } from "@/lib/format";
import { useAction, usePoll, useResource } from "@/lib/hooks";
import styles from "./versions.module.css";

export default function VersionsPage() {
  const { pid, presentation, refreshAll } = useWorkspace();
  const toast = useToast();
  const branch = useAction();
  const revert = useAction();

  const versions = useResource((init) => api.listVersions(pid, init), [pid]);
  const [pickedA, setPickedA] = useState<number | null>(null);
  const [pickedB, setPickedB] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const [branchJobId, setBranchJobId] = useState<string | null>(null);

  const list = useMemo(() => versions.data ?? [], [versions.data]);
  const lockedVersions = list.filter((v) => v.locked);

  // Default the comparison to the two most recent versions.
  const a = pickedA ?? list[list.length - 2]?.version ?? null;
  const b = pickedB ?? list[list.length - 1]?.version ?? null;

  const diff = useResource(
    () => api.diffVersions(pid, a as number, b as number),
    [pid, a, b],
    { enabled: a !== null && b !== null && a !== b },
  );

  const job = usePoll(() => api.getJob(branchJobId as string), {
    active: Boolean(branchJobId),
    intervalMs: 2500,
    done: (j) => j.status === "done" || j.status === "error",
  });

  useEffect(() => {
    if (job?.status === "done") {
      versions.refresh();
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const runBranch = async (version: number) => {
    if (!instruction.trim()) {
      toast.error("Describe the variant you want");
      return;
    }
    const result = await branch.run(() => api.branchVersion(pid, version, instruction.trim()));
    if (result) {
      setBranchJobId(result.job_id);
      setInstruction("");
      toast.success("Branch queued — the worker is regenerating the deck");
    }
  };

  const runRevert = async (version: number) => {
    const result = await revert.run(() => api.revertVersion(pid, version), String(version));
    if (result) {
      versions.refresh();
      refreshAll();
      toast.success(`Reverted into a new draft v${result.version}`);
    }
  };

  if (versions.loading) return <LoadingBlock label="Loading version history…" />;

  return (
    <>
      <PageHeader
        eyebrow="Phase 5"
        title="Versions"
        description="Every lock creates an immutable version. Branch one to have the agent generate a variant — a shorter cut, a different audience — without touching the original."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={versions.refresh}
            leading={<Icon name="refresh" size={15} />}
          >
            Refresh
          </Button>
        }
      />

      {versions.error && (
        <Alert tone="danger" title="Could not load versions">
          {versions.error}
        </Alert>
      )}

      {list.length === 0 ? (
        <Card pad="none">
          <EmptyState
            icon={<Icon name="versions" size={24} />}
            title="No versions yet"
            body="Lock a deck and it becomes version 1. From then on every lock adds another immutable snapshot you can diff, revert to, or branch from."
            compact
          />
        </Card>
      ) : (
        <div className={styles.layout}>
          <div className={styles.timeline}>
            {[...list].reverse().map((v, i, arr) => (
              <div key={v.version} className={styles.row} style={{ animationDelay: `${i * 30}ms` }}>
                <div className={styles.spine}>
                  <span
                    className={[
                      styles.dot,
                      v.locked && styles.dotLocked,
                      v.version === presentation?.current_version && styles.dotCurrent,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                  {i < arr.length - 1 && <span className={styles.line} />}
                </div>

                <Card className={styles.card}>
                  <div className={styles.head}>
                    <span className={styles.version}>Version {v.version}</span>
                    {v.locked ? (
                      <Badge tone="accent" pill>
                        <Icon name="lock" size={11} /> Locked
                      </Badge>
                    ) : (
                      <Badge tone="warning" pill>
                        Draft
                      </Badge>
                    )}
                    {v.version === presentation?.current_version && (
                      <Badge tone="success" pill>
                        Current
                      </Badge>
                    )}
                    {v.branch_label && <Badge tone="info">{v.branch_label}</Badge>}
                  </div>

                  <div className={styles.meta}>
                    <span className={styles.metaItem}>
                      <Icon name="deck" size={14} />
                      {plural(v.slides, "slide")}
                    </span>
                    <span className={styles.metaItem}>
                      <Icon name="clock" size={14} />
                      {relativeTime(v.created_at)}
                    </span>
                    {v.parent_version != null && (
                      <span className={styles.metaItem}>
                        <Icon name="branch" size={14} />
                        from v{v.parent_version}
                      </span>
                    )}
                  </div>

                  <div className={styles.actions}>
                    {v.slides_file_id && (
                      <a
                        href={`https://docs.google.com/presentation/d/${v.slides_file_id}/edit`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          leading={<Icon name="external" size={14} />}
                        >
                          Open in Slides
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runRevert(v.version)}
                      pending={revert.isPending(String(v.version))}
                      leading={<Icon name="refresh" size={14} />}
                    >
                      Revert into new draft
                    </Button>
                    {v.locked && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runBranch(v.version)}
                        pending={branch.pending}
                        leading={<Icon name="branch" size={14} />}
                      >
                        Branch this
                      </Button>
                    )}
                  </div>
                </Card>
              </div>
            ))}
          </div>

          {(branch.error || revert.error) && (
            <Alert tone="danger" title="Action failed">
              {branch.error ?? revert.error}
            </Alert>
          )}

          <Card>
            <CardHeader
              title="Branch a locked version"
              subtitle="The worker regenerates the deck against your instruction and saves it as a new version."
            />
            <div className={styles.branchRow}>
              <div className={styles.branchInput}>
                <Field label="Instruction">
                  <Input
                    value={instruction}
                    placeholder="Make a 5-minute customer version of this deck"
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                </Field>
              </div>
              <Button
                variant="primary"
                disabled={lockedVersions.length === 0 || !instruction.trim()}
                pending={branch.pending}
                onClick={() => runBranch(lockedVersions[lockedVersions.length - 1].version)}
                leading={<Icon name="branch" size={16} />}
              >
                Branch latest locked
              </Button>
            </div>
            {lockedVersions.length === 0 && (
              <div style={{ marginTop: "var(--s3)" }}>
                <Alert tone="info">You can only branch from a locked version. Lock a deck first.</Alert>
              </div>
            )}
            {branchJobId && (
              <div className={styles.jobRow}>
                <Badge
                  tone={
                    job?.status === "done" ? "success" : job?.status === "error" ? "danger" : "accent"
                  }
                  dot
                  live={!job || (job.status !== "done" && job.status !== "error")}
                >
                  Branch {job?.status ?? "queued"}
                </Badge>
                {job?.status === "error" && <span>{job.error}</span>}
              </div>
            )}
          </Card>

          {list.length >= 2 && (
            <Card>
              <CardHeader title="Compare versions" subtitle="Structural diff by slide id" />
              <div className={styles.diffPickers}>
                <Field label="From">
                  <select
                    className={styles.select}
                    value={a ?? ""}
                    onChange={(e) => setPickedA(Number(e.target.value))}
                  >
                    {list.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="To">
                  <select
                    className={styles.select}
                    value={b ?? ""}
                    onChange={(e) => setPickedB(Number(e.target.value))}
                  >
                    {list.map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {a === b ? (
                <div className={styles.diffResult}>
                  <span className={styles.diffEmpty}>Pick two different versions.</span>
                </div>
              ) : diff.error ? (
                <div style={{ marginTop: "var(--s4)" }}>
                  <Alert tone="danger">{diff.error}</Alert>
                </div>
              ) : (
                diff.data && (
                  <div className={styles.diffResult}>
                    {(
                      [
                        ["Added", diff.data.added, "success"],
                        ["Removed", diff.data.removed, "danger"],
                        ["Changed", diff.data.changed, "warning"],
                      ] as const
                    ).map(([label, ids, tone]) => (
                      <div key={label} className={styles.diffGroup}>
                        <span className={styles.diffLabel}>
                          {label}
                          <Badge tone={tone}>{ids.length}</Badge>
                        </span>
                        {ids.length === 0 ? (
                          <span className={styles.diffEmpty}>None</span>
                        ) : (
                          <div className={styles.diffIds}>
                            {ids.map((id) => (
                              <Badge key={id} tone="neutral">
                                {id}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
