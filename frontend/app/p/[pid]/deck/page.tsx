"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SlideCanvas } from "@/components/SlideCanvas";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { humanizeId, plural } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import type { Slide } from "@/lib/types";
import styles from "./deck.module.css";

const EDIT_SUGGESTIONS = [
  "Make this a two-column comparison",
  "Tighten the bullets to six words each",
  "Turn this into a metrics slide",
  "Soften the claim — legal will push back",
  "Add a closing line that asks for the meeting",
];

export default function DeckPage() {
  const { pid, presentation, deck, setDeck, refreshDeck } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const build = useAction();
  const edit = useAction();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [clarify, setClarify] = useState<string | null>(null);
  const [changes, setChanges] = useState<string[]>([]);

  const slides = useMemo(
    () => [...(deck?.slides ?? [])].sort((a, b) => a.order - b.order),
    [deck],
  );
  const sections = presentation?.outline.sections ?? [];
  const outlineApproved = Boolean(presentation?.outline.approved);
  const locked = Boolean(deck?.locked);

  // Falling back to the first slide keeps the selection valid as slides come and
  // go, with no effect needed to repair stale state.
  const selected: Slide | null =
    slides.find((s) => s.id === selectedId) ?? slides[0] ?? null;

  const slidesBySection = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slides) map.set(s.section_id, (map.get(s.section_id) ?? 0) + 1);
    return map;
  }, [slides]);

  const buildSection = async (sectionId: string) => {
    const result = await build.run(() => api.buildSection(pid, sectionId), sectionId);
    if (result) {
      refreshDeck();
      toast.success(`Built ${plural(result.slides.length, "slide")} for ${humanizeId(sectionId)}`);
      if (result.slides[0]) setSelectedId(result.slides[0].id);
    }
  };

  const buildAll = async () => {
    const pending = sections.filter((s) => !slidesBySection.has(s.id));
    for (const section of pending) {
      const result = await build.run(() => api.buildSection(pid, section.id), "all");
      if (!result) break; // stop at the first failure rather than hammering the model
    }
    refreshDeck();
  };

  const submitEdit = async (text: string) => {
    if (!selected || !text.trim()) return;
    setClarify(null);
    const result = await edit.run(() => api.editSlide(pid, selected.id, text.trim()));
    if (!result) return;

    if (result.clarifying_question) {
      setClarify(result.clarifying_question);
      return;
    }
    setEditText("");
    if (result.slide) {
      const updated = result.slide;
      setDeck((prev) =>
        prev ? { ...prev, slides: prev.slides.map((s) => (s.id === updated.id ? updated : s)) } : prev,
      );
    }
    if (result.change_summary) setChanges((c) => [result.change_summary as string, ...c].slice(0, 8));
    toast.success("Slide updated");
  };

  const approveSlide = async () => {
    if (!selected) return;
    const ok = await edit.run(() => api.approveSlide(pid, selected.id), "approve");
    if (ok) {
      setDeck((prev) =>
        prev
          ? {
              ...prev,
              slides: prev.slides.map((s) => (s.id === selected.id ? { ...s, approved: true } : s)),
            }
          : prev,
      );
      toast.success("Slide approved");
    }
  };

  // ---- gate ----

  if (!outlineApproved) {
    return (
      <>
        <PageHeader eyebrow="Phase 1" title="Deck" />
        <Card pad="none">
          <EmptyState
            icon={<Icon name="lock" size={24} />}
            title="Approve the outline first"
            body="The builder works one outline section at a time, so the structure has to be settled before it can generate slides."
            actions={
              <Button variant="primary" onClick={() => router.push(`/p/${pid}/outline`)}>
                Go to outline
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  const unbuilt = sections.filter((s) => !slidesBySection.has(s.id));
  const approvedCount = slides.filter((s) => s.approved).length;

  // Sourcing is the product's actual promise, so it belongs next to the approval
  // count rather than only inside the pre-flight check.
  const metrics = slides.flatMap((s) => s.blocks.filter((b) => b.kind === "metric"));
  const unsourced = metrics.filter((b) => !b.source_ref).length;

  return (
    <>
      <PageHeader
        eyebrow="Phase 1"
        title="Deck"
        description="Build each section, then talk to the builder to refine any slide. Every number keeps a link back to the file it came from."
        actions={
          <div className={styles.badges}>
            {locked && (
              <Badge tone="neutral" pill>
                <Icon name="lock" size={12} /> Locked v{deck?.version}
              </Badge>
            )}
            {metrics.length > 0 && (
              <Badge tone={unsourced === 0 ? "success" : "warning"} pill>
                {unsourced === 0
                  ? `all ${metrics.length} figures sourced`
                  : `${unsourced} of ${metrics.length} figures unsourced`}
              </Badge>
            )}
            {slides.length > 0 && (
              <Badge tone={approvedCount === slides.length ? "success" : "warning"} pill>
                {approvedCount}/{slides.length} approved
              </Badge>
            )}
          </div>
        }
      />

      {locked && (
        <div style={{ marginBottom: "var(--s5)" }}>
          <Alert tone="info" title={`Version ${deck?.version} is locked`}>
            Locked versions are immutable. Editing again starts a new draft version.
          </Alert>
        </div>
      )}

      <div className={styles.sections}>
        {sections.map((section) => {
          const count = slidesBySection.get(section.id) ?? 0;
          const built = count > 0;
          return (
            <div
              key={section.id}
              className={[styles.sectionChip, built && styles.sectionChipBuilt].filter(Boolean).join(" ")}
            >
              <span className={styles.sectionName} title={section.title}>
                {section.title}
              </span>
              {built && <span className={styles.sectionCount}>{count}</span>}
              <Button
                variant={built ? "ghost" : "tonal"}
                size="sm"
                pending={build.isPending(section.id)}
                onClick={() => buildSection(section.id)}
                leading={<Icon name={built ? "refresh" : "plus"} size={14} />}
              >
                {built ? "Rebuild" : "Build"}
              </Button>
            </div>
          );
        })}
      </div>

      {build.error && (
        <div style={{ marginBottom: "var(--s5)" }}>
          <Alert tone="danger" title="Could not build that section">
            {build.error}
          </Alert>
        </div>
      )}

      {slides.length === 0 ? (
        <Card>
          <div className={styles.buildBar}>
            <span className={styles.buildText}>
              {plural(sections.length, "section")} waiting. The builder writes 1–3 slides each,
              picking a template per slide and citing any facts it uses.
            </span>
            <Button
              variant="primary"
              onClick={buildAll}
              pending={build.isPending("all")}
            >
              Build all sections
            </Button>
          </div>
        </Card>
      ) : (
        <div className={styles.split}>
          <div className={styles.thumbs}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={[styles.thumb, s.id === selected?.id && styles.thumbActive]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedId(s.id)}
                aria-current={s.id === selected?.id}
              >
                <span className={styles.thumbIndex}>{i + 1}</span>
                <span className={styles.thumbCanvas}>
                  <SlideCanvas slide={s} showProvenance={false} />
                  {s.approved && (
                    <span className={styles.thumbBadge}>
                      <Icon name="check" size={10} />
                    </span>
                  )}
                </span>
              </button>
            ))}
            {unbuilt.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={buildAll}
                pending={build.isPending("all")}
                leading={<Icon name="plus" size={15} />}
              >
                Build {unbuilt.length} more
              </Button>
            )}
          </div>

          {selected && (
            <div className={styles.detail}>
              <div className={styles.canvasWrap}>
                <SlideCanvas slide={selected} bordered={false} />
              </div>

              <div className={styles.detailBar}>
                <span className={styles.detailTitle}>{selected.title || "Untitled slide"}</span>
                <span className={styles.detailSpacer} />
                <Badge tone="neutral">{selected.template.replace("_", " ")}</Badge>
                {selected.approved ? (
                  <Badge tone="success" dot>
                    Approved
                  </Badge>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={approveSlide}
                    pending={edit.isPending("approve")}
                    leading={<Icon name="check" size={15} />}
                  >
                    Approve
                  </Button>
                )}
              </div>

              <Card>
                <CardHeader
                  title="Ask the builder for a change"
                  subtitle="Plain language. It edits only what you ask for, and asks back when a request is ambiguous."
                />
                <div className={styles.editRow}>
                  <div className={styles.editInput}>
                    <Input
                      value={editText}
                      placeholder="e.g. use the Q2 revenue number from the sheet"
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitEdit(editText);
                      }}
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => submitEdit(editText)}
                    pending={edit.pending && !edit.isPending("approve")}
                    disabled={!editText.trim()}
                  >
                    Apply
                  </Button>
                </div>

                <div className={styles.suggestions}>
                  {EDIT_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={styles.suggestion}
                      onClick={() => {
                        setEditText(s);
                        void submitEdit(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {clarify && (
                  <div style={{ marginTop: "var(--s4)" }}>
                    <Alert tone="warning" title="The builder needs a decision">
                      {clarify}
                    </Alert>
                  </div>
                )}

                {edit.error && (
                  <div style={{ marginTop: "var(--s4)" }}>
                    <Alert tone="danger" title="Edit failed">
                      {edit.error}
                    </Alert>
                  </div>
                )}

                {changes.length > 0 && (
                  <div className={styles.changeLog}>
                    {changes.map((c, i) => (
                      <div key={i} className={styles.changeItem}>
                        <Icon name="check" size={14} className={styles.changeIcon} />
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {selected.speaker_notes && (
                <Card>
                  <CardHeader title="Speaker notes" subtitle="What to say, not what's on the slide" />
                  <p className={styles.notes}>{selected.speaker_notes}</p>
                </Card>
              )}

              {selected.blocks.length > 0 && (
                <Card>
                  <CardHeader title="Content blocks" subtitle="Provenance for every number" />
                  <div className={styles.blocks}>
                    {selected.blocks.map((b, i) => (
                      <div key={i} className={styles.block}>
                        <span className={styles.blockKind}>{b.kind}</span>
                        <span className={styles.blockText}>
                          {b.value && <span className={styles.blockValue}>{b.value}</span>}
                          {b.text}
                        </span>
                        {b.kind === "metric" && !b.source_ref ? (
                          <span className={`${styles.blockRef} ${styles.blockUnsourced}`}>
                            unsourced
                          </span>
                        ) : (
                          b.source_ref && <span className={styles.blockRef}>{b.source_ref}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {slides.length > 0 && (
        <div style={{ marginTop: "var(--s7)", display: "flex", justifyContent: "flex-end", gap: "var(--s2)" }}>
          <Button
            variant="primary"
            onClick={() => router.push(`/p/${pid}/rehearse`)}
            trailing={<Icon name="arrowRight" size={16} />}
          >
            Rehearse and lock
          </Button>
        </div>
      )}
    </>
  );
}
