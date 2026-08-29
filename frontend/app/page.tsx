"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeader } from "@/components/PageHeader";
import { ArtifactFrame } from "@/components/workspace/ArtifactFrame";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Artifact } from "@/lib/artifacts";
import type { Workspace, WorkspacePage } from "@/lib/types";
import styles from "./page.module.css";

function pageAsArtifact(page: WorkspacePage): Artifact {
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

function WorkspaceCard({ workspace, index }: { workspace: Workspace; index: number }) {
  const router = useRouter();
  // Preview the real pages people made (edited ones have an updated_at).
  const edited = workspace.pages.filter((p) => p.updated_at);
  const previews = (edited.length ? edited : workspace.pages)
    .slice(0, 3)
    .map(pageAsArtifact);

  return (
    <button
      type="button"
      className={styles.card}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      onClick={() => router.push(`/w/${workspace.id}`)}
    >
      <span className={styles.preview}>
        {previews.map((artifact) => (
          <span key={artifact.id} className={styles.previewItem}>
            <ArtifactFrame artifact={artifact} logicalWidth={900} />
          </span>
        ))}
        {previews.length === 0 && (
          <span className={styles.previewItem}>
            <span className={styles.newIcon}>
              <Icon name="sparkle" size={20} />
            </span>
          </span>
        )}
      </span>

      <span className={styles.body}>
        <span className={styles.name}>{workspace.title}</span>
        <span className={styles.purpose}>
          {workspace.notes.length > 0
            ? `${workspace.notes.length} notes captured`
            : "Nothing captured yet — open it and start talking."}
        </span>
        <span className={styles.foot}>
          <span className={styles.footMeta}>
            {workspace.member_uids.length} member{workspace.member_uids.length === 1 ? "" : "s"}
          </span>
          <span className={styles.footMeta}>
            {workspace.pages.length} page{workspace.pages.length === 1 ? "" : "s"} ·{" "}
            {relativeTime(workspace.created_at)}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const workspaces = useResource((init) => api.listWorkspaces(init), []);

  const createWorkspace = () => {
    toast.success("New workspace");
    router.push("/w/new");
  };

  const mine = [...(workspaces.data ?? [])].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>
            Describe it. <span className={styles.heroAccent}>Watch it render.</span>
          </h1>
          <p className={styles.heroSub}>
            A shared canvas where the agent builds the thing itself — slides, pages, charts,
            memos — with your data, your team, and every version kept.
          </p>
          <div className={styles.heroActions}>
            <Button
              variant="primary"
              size="lg"
              leading={<Icon name="plus" size={18} />}
              onClick={createWorkspace}
            >
              New workspace
            </Button>
          </div>
        </section>

        <SectionHeader title="Your workspaces" />

        <div className={styles.grid}>
          {mine.map((workspace, i) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} index={i} />
          ))}
          <button type="button" className={styles.newCard} onClick={createWorkspace}>
            <span className={styles.newIcon}>
              <Icon name="plus" size={20} />
            </span>
            New workspace
          </button>
        </div>
      </main>
    </div>
  );
}
