"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import type { DeckVersion, Presentation, Talk, VersionSummary } from "@/lib/types";

interface WorkspaceValue {
  pid: string;
  presentation: Presentation | null;
  /** The mutable working draft. Opening it can lazily create a new version. */
  deck: DeckVersion | null;
  versions: VersionSummary[] | null;
  /** Newest locked version, which is what "present" and "branch" act on. */
  lockedVersion: VersionSummary | null;
  talks: Talk[] | null;
  loading: boolean;
  error: string | null;
  refreshPresentation: () => void;
  refreshDeck: () => void;
  refreshTalks: () => void;
  refreshVersions: () => void;
  refreshAll: () => void;
  setPresentation: (p: Presentation) => void;
  setDeck: (d: DeckVersion | ((prev: DeckVersion | null) => DeckVersion | null)) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

export function WorkspaceProvider({ pid, children }: { pid: string; children: ReactNode }) {
  const presentation = useResource((init) => api.getPresentation(pid, init), [pid]);
  const deck = useResource((init) => api.getDeck(pid, init), [pid]);
  const talks = useResource((init) => api.listTalks(pid, init), [pid]);
  const versions = useResource((init) => api.listVersions(pid, init), [pid]);

  const refreshAll = useCallback(() => {
    presentation.refresh();
    deck.refresh();
    talks.refresh();
    versions.refresh();
  }, [presentation, deck, talks, versions]);

  const lockedVersion = useMemo(() => {
    const locked = (versions.data ?? []).filter((v) => v.locked);
    return locked.length ? locked[locked.length - 1] : null;
  }, [versions.data]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      pid,
      presentation: presentation.data,
      deck: deck.data,
      versions: versions.data,
      lockedVersion,
      talks: talks.data,
      loading: presentation.loading,
      error: presentation.error,
      refreshPresentation: presentation.refresh,
      refreshDeck: deck.refresh,
      refreshTalks: talks.refresh,
      refreshVersions: versions.refresh,
      refreshAll,
      setPresentation: presentation.mutate,
      setDeck: deck.mutate,
    }),
    [pid, presentation, deck, talks, versions, lockedVersion, refreshAll],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
