"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeader } from "@/components/PageHeader";
import { SlideCanvas } from "@/components/SlideCanvas";
import { ViewTransition } from "@/components/ViewTransition";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { plural, relativeTime } from "@/lib/format";
import { useAction, useResource } from "@/lib/hooks";
import type { Presentation, Slide } from "@/lib/types";
import styles from "./page.module.css";

/**
 * The card cover is a genuine slide render rather than an abstract graphic, so
 * a deck looks like a deck in the list. Built from data already on the card.
 */
function coverSlide(p: Presentation): Slide {
  const audience = p.brief.audience ? `For ${p.brief.audience}` : "Audience not set yet";
  return {
    id: `cover-${p.id}`,
    section_id: "cover",
    template: "hero",
    title: p.title,
    blocks: [{ kind: "text", text: audience, value: "", source_ref: "" }],
    speaker_notes: "",
    image_prompt: "",
    image_url: "",
    image_rev: 0,
    approved: false,
    order: 0,
  };
}

function stepStates(p: Presentation): ("done" | "active" | "todo")[] {
  const brief = p.brief.complete;
  const outline = p.outline.approved;
  const deck = p.current_version > 0 && outline;
  return [
    brief ? "done" : "active",
    outline ? "done" : brief ? "active" : "todo",
    deck ? "done" : outline ? "active" : "todo",
  ];
}

function PresentationCard({ p, index }: { p: Presentation; index: number }) {
  const router = useRouter();
  const steps = stepStates(p);
  const open = () => router.push(`/p/${p.id}/brief`);
  const cover = useMemo(() => coverSlide(p), [p]);

  return (
    <Card
      interactive
      className={styles.card}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      onClick={open}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      {/* Shared name: the cover morphs rather than cutting when you open it. */}
      <ViewTransition name={`deck-cover-${p.id}`} share="morph">
        <div className={styles.cover}>
          <SlideCanvas slide={cover} bordered={false} showProvenance={false} />
          {p.current_version > 0 && (
            <span className={styles.coverCount}>
              <Icon name="deck" size={11} />v{p.current_version}
            </span>
          )}
        </div>
      </ViewTransition>

      <div className={styles.body}>
        {/* No title here: the cover already carries it, at a readable size. */}
        <div className={styles.cardMeta}>
          {p.brief.audience && (
            <span className={styles.metaItem}>
              <Icon name="users" size={14} />
              {p.brief.audience}
            </span>
          )}
          <span className={styles.metaItem}>
            <Icon name="clock" size={14} />
            {p.brief.duration_minutes} min
          </span>
          {p.facts.length > 0 && (
            <span className={styles.metaItem}>
              <Icon name="sources" size={14} />
              {plural(p.facts.length, "fact")}
            </span>
          )}
        </div>

        <div className={styles.badges}>
          {p.brief.complete && <Badge tone="success">Brief</Badge>}
          {p.outline.approved ? (
            <Badge tone="success">Outline</Badge>
          ) : (
            p.outline.sections.length > 0 && (
              <Badge tone="warning">{plural(p.outline.sections.length, "section")}</Badge>
            )
          )}
        </div>

        <span className={styles.spacer} />

        <div className={styles.steps} aria-hidden>
          {steps.map((s, i) => (
            <span
              key={i}
              className={[
                styles.step,
                s === "done" && styles.stepDone,
                s === "active" && styles.stepActive,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))}
        </div>

        <div className={styles.cardFoot}>
          <span>Created {relativeTime(p.created_at)}</span>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, loading, error, refresh } = useResource((init) => api.listPresentations(init), []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const action = useAction();

  const create = async () => {
    const name = title.trim() || "Untitled presentation";
    const created = await action.run(() => api.createPresentation(name));
    if (created) {
      setDialogOpen(false);
      setTitle("");
      toast.success(`Created “${created.title}”`);
      router.push(`/p/${created.id}/brief`);
    }
  };

  const presentations = data ?? [];

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>
            Prepare, present,
            <br />
            <span className={styles.heroAccent}>follow up.</span>
          </h1>
          <p className={styles.heroSub}>
            Deckhand interviews you, builds the deck from your real data, sits in as a silent
            note-taker while you present, and handles what comes after.
          </p>
          <div className={styles.heroActions}>
            <Button
              variant="primary"
              size="lg"
              leading={<Icon name="plus" size={18} />}
              onClick={() => setDialogOpen(true)}
            >
              New presentation
            </Button>
            {presentations.length > 0 && (
              <span className={styles.heroHint}>
                {plural(presentations.length, "deck")} in progress
              </span>
            )}
          </div>
        </section>

        <SectionHeader
          title="Your presentations"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              leading={<Icon name="refresh" size={15} />}
            >
              Refresh
            </Button>
          }
        />

        {error && (
          <Alert
            tone="danger"
            title="Could not load your presentations"
            actions={
              <Button size="sm" variant="secondary" onClick={refresh}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {loading && (
          <div className={styles.grid}>
            {[0, 1, 2].map((i) => (
              <Card key={i} className={styles.skelCard}>
                <Skeleton className={styles.skelCover} height="auto" />
                <Skeleton width="70%" height={18} />
                <Skeleton width="45%" height={13} />
                <Skeleton height={3} />
              </Card>
            ))}
          </div>
        )}

        {!loading && !error && presentations.length === 0 && (
          <EmptyState
            icon={<Icon name="deck" size={24} />}
            title="No presentations yet"
            body="Start one and the intake agent will interview you about your audience, your time budget, and the decision you want them to make."
            actions={
              <Button
                variant="primary"
                onClick={() => setDialogOpen(true)}
                leading={<Icon name="plus" size={17} />}
              >
                New presentation
              </Button>
            }
          />
        )}

        {!loading && presentations.length > 0 && (
          <div className={styles.grid}>
            {presentations.map((p, i) => (
              <PresentationCard key={p.id} p={p} index={i} />
            ))}
            <button type="button" className={styles.newCard} onClick={() => setDialogOpen(true)}>
              <span className={styles.newIcon}>
                <Icon name="plus" size={20} />
              </span>
              New presentation
            </button>
          </div>
        )}
      </main>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="New presentation"
        description="Give it a working name. You can change it later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} pending={action.pending}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Title">
          <Input
            autoFocus
            value={title}
            placeholder="Series A — Northwind"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
        </Field>
        {action.error && <Alert tone="danger">{action.error}</Alert>}
      </Dialog>
    </div>
  );
}
