"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeader } from "@/components/PageHeader";
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
import type { Presentation } from "@/lib/types";
import styles from "./page.module.css";

/** Coarse progress for the card's step bar: brief → outline → deck → locked. */
function stepStates(p: Presentation): ("done" | "active" | "todo")[] {
  const brief = p.brief.complete;
  const outline = p.outline.approved;
  const deck = p.current_version > 0 && outline;
  const steps: ("done" | "active" | "todo")[] = [
    brief ? "done" : "active",
    outline ? "done" : brief ? "active" : "todo",
    deck ? "done" : outline ? "active" : "todo",
  ];
  return steps;
}

function PresentationCard({ p, index }: { p: Presentation; index: number }) {
  const router = useRouter();
  const steps = stepStates(p);

  return (
    <Card
      interactive
      className={styles.card}
      style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
      onClick={() => router.push(`/p/${p.id}/brief`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/p/${p.id}/brief`);
        }
      }}
    >
      <div className={styles.cardTop}>
        <div>
          <div className={styles.cardTitle}>{p.title}</div>
          <div className={styles.cardMeta}>
            {p.brief.audience ? (
              <span className={styles.metaItem}>
                <Icon name="users" size={14} />
                {p.brief.audience}
              </span>
            ) : (
              <span className={styles.metaItem}>No audience yet</span>
            )}
            <span className={styles.metaItem}>
              <Icon name="clock" size={14} />
              {p.brief.duration_minutes} min
            </span>
          </div>
        </div>
      </div>

      <div className={styles.spacer} />

      <div className={styles.badges}>
        {p.brief.complete && <Badge tone="success">Brief</Badge>}
        {p.outline.approved && <Badge tone="success">Outline</Badge>}
        {p.outline.sections.length > 0 && !p.outline.approved && (
          <Badge tone="warning">{plural(p.outline.sections.length, "section")}</Badge>
        )}
        {p.facts.length > 0 && <Badge tone="accent">{plural(p.facts.length, "fact")}</Badge>}
      </div>

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
        {p.current_version > 0 && <span>v{p.current_version}</span>}
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
          <h1 className={styles.heroTitle}>Prepare, present, follow up.</h1>
          <p className={styles.heroSub}>
            Deckhand interviews you, builds the deck from your real data, takes notes while
            you present, and handles the follow-up afterwards.
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
                <Skeleton width="70%" height={18} />
                <Skeleton width="45%" height={13} />
                <div className={styles.spacer} />
                <Skeleton height={3} />
                <Skeleton width="55%" height={12} />
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
              <Button variant="primary" onClick={() => setDialogOpen(true)} leading={<Icon name="plus" size={17} />}>
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
            placeholder="Seed round pitch"
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
