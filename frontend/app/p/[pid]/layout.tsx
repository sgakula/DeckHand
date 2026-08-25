"use client";

import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PhaseRail } from "@/components/PhaseRail";
import { WorkspaceProvider, useWorkspace } from "@/components/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import { Alert, LoadingBlock } from "@/components/ui/Status";
import { computePhases, PHASE_ORDER, type PhaseId } from "@/lib/phases";
import styles from "./layout.module.css";

function Shell({ children }: { children: ReactNode }) {
  const { pid, presentation, deck, talks, lockedVersion, loading, error, refreshAll } =
    useWorkspace();
  const pathname = usePathname();

  const segment = pathname.split("/")[3] ?? "brief";
  const activeId = (PHASE_ORDER.includes(segment as PhaseId) ? segment : "brief") as PhaseId;
  const phases = computePhases(presentation, deck, talks, activeId, Boolean(lockedVersion));

  if (error && !presentation) {
    return (
      <div className={styles.shell}>
        <AppHeader />
        <div className={styles.errorWrap}>
          <Alert tone="danger" title="Could not load this presentation">
            {error}
          </Alert>
          <div>
            <Button variant="secondary" onClick={refreshAll}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <AppHeader docTitle={presentation?.title} />
      <div className={styles.body}>
        <PhaseRail pid={pid} phases={phases} />
        <main className={styles.main}>
          {loading && !presentation ? (
            <div className={styles.loading}>
              <LoadingBlock label="Opening presentation…" />
            </div>
          ) : (
            <div className={styles.narrow}>{children}</div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { pid } = useParams<{ pid: string }>();
  return (
    <WorkspaceProvider pid={pid}>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
