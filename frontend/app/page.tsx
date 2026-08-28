"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeader } from "@/components/PageHeader";
import { ArtifactFrame } from "@/components/workspace/ArtifactFrame";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import {
  WORKSPACES,
  artifactById,
  collaboratorById,
  type WorkspaceSummary,
} from "@/lib/artifacts";
import styles from "./page.module.css";

function WorkspaceCard({ workspace, index }: { workspace: WorkspaceSummary; index: number }) {
  const router = useRouter();
  const previews = workspace.previewIds.map(artifactById).filter(Boolean);

  return (
    <button
      type="button"
      className={styles.card}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      onClick={() => router.push(`/w/${workspace.id}`)}
    >
      <span className={styles.preview}>
        {workspace.live && (
          <span className={styles.liveTag}>
            <span className={styles.liveDot} />
            2 editing
          </span>
        )}
        {previews.map((artifact) => (
          <span key={artifact!.id} className={styles.previewItem}>
            <ArtifactFrame artifact={artifact!} logicalWidth={900} />
          </span>
        ))}
      </span>

      <span className={styles.body}>
        <span className={styles.name}>{workspace.name}</span>
        <span className={styles.purpose}>{workspace.purpose}</span>
        <span className={styles.foot}>
          <span className={styles.members}>
            {workspace.memberIds.map((id) => {
              const person = collaboratorById(id);
              return (
                <span key={id} className={styles.avatar} style={{ background: person.color }}>
                  {person.initials}
                </span>
              );
            })}
          </span>
          <span className={styles.footMeta}>
            {workspace.artifactCount} items · {relativeTime(workspace.updatedAt)}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();

  const createWorkspace = () => {
    toast.success("New workspace");
    router.push("/w/new");
  };

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
          {WORKSPACES.map((workspace, i) => (
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
