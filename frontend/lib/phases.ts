import type { IconName } from "@/components/ui/Icon";
import type { DeckVersion, Presentation, Talk } from "./types";

export type PhaseId =
  | "brief"
  | "sources"
  | "outline"
  | "deck"
  | "rehearse"
  | "present"
  | "debrief"
  | "versions";

export type PhaseStatus = "done" | "active" | "available" | "locked";

export interface Phase {
  id: PhaseId;
  label: string;
  icon: IconName;
  /** Shown under the label in the rail when the phase is blocked. */
  blockedReason?: string;
  status: PhaseStatus;
  /**
   * Whether the phase is finished, independent of `status`. Viewing a finished
   * phase makes it "active", so progress has to count this instead.
   */
  complete: boolean;
  /** Small trailing count or badge shown in the rail. */
  hint?: string;
}

export const PHASE_ORDER: PhaseId[] = [
  "brief",
  "sources",
  "outline",
  "deck",
  "rehearse",
  "present",
  "debrief",
  "versions",
];

const LABELS: Record<PhaseId, { label: string; icon: IconName }> = {
  brief: { label: "Brief", icon: "brief" },
  sources: { label: "Sources", icon: "sources" },
  outline: { label: "Outline", icon: "outline" },
  deck: { label: "Deck", icon: "deck" },
  rehearse: { label: "Rehearse", icon: "rehearse" },
  present: { label: "Present", icon: "present" },
  debrief: { label: "Debrief", icon: "debrief" },
  versions: { label: "Versions", icon: "versions" },
};

/**
 * Derives rail state from the same data the API returns, so the rail can never
 * disagree with what the screens themselves will allow.
 */
export function computePhases(
  p: Presentation | null,
  deck: DeckVersion | null,
  talks: Talk[] | null,
  activeId: PhaseId,
  /** Any locked version in history — not the working draft, which relocks to false. */
  hasLockedVersion = false,
): Phase[] {
  const briefDone = Boolean(p?.brief.complete);
  const sourcesDone = Boolean(p && (p.facts.length > 0 || p.source_file_ids.length > 0));
  const outlineProposed = Boolean(p && p.outline.sections.length > 0);
  const outlineDone = Boolean(p?.outline.approved);
  const slides = deck?.slides ?? [];
  const sectionsCovered = new Set(slides.map((s) => s.section_id)).size;
  const totalSections = p?.outline.sections.length ?? 0;
  const deckDone = slides.length > 0 && sectionsCovered >= totalSections && totalSections > 0;
  const allApproved = slides.length > 0 && slides.every((s) => s.approved);
  const deckLocked = Boolean(deck?.locked) || hasLockedVersion;
  const hasTalk = Boolean(talks && talks.length > 0);
  const hasFinishedTalk = Boolean(talks?.some((t) => t.status !== "live"));
  // GET /deck lazily creates an empty v1, so current_version alone is not evidence
  // that there is any version history worth showing.
  const hasVersions = slides.length > 0 || (p?.current_version ?? 0) > 1;

  const state = (
    id: PhaseId,
    done: boolean,
    unlocked: boolean,
    blockedReason?: string,
    hint?: string,
  ): Phase => ({
    id,
    ...LABELS[id],
    status: id === activeId ? "active" : done ? "done" : unlocked ? "available" : "locked",
    complete: done,
    blockedReason: unlocked ? undefined : blockedReason,
    hint,
  });

  return [
    state("brief", briefDone, true, undefined, briefDone ? undefined : "in progress"),
    state("sources", sourcesDone, true, undefined, p?.facts.length ? `${p.facts.length} facts` : undefined),
    state(
      "outline",
      outlineDone,
      briefDone,
      "Finish the brief first",
      outlineProposed ? `${totalSections} sections` : undefined,
    ),
    state(
      "deck",
      deckDone && allApproved,
      outlineDone,
      "Approve the outline first",
      slides.length ? `${slides.length} slides` : undefined,
    ),
    state("rehearse", deckLocked, slides.length > 0, "Build some slides first"),
    state("present", hasFinishedTalk, deckLocked, "Lock the deck first"),
    state("debrief", hasFinishedTalk, hasTalk, "Present the deck first"),
    state("versions", false, hasVersions, "No versions yet", hasVersions ? `v${p?.current_version}` : undefined),
  ];
}

export function phaseHref(pid: string, id: PhaseId): string {
  return `/p/${pid}/${id}`;
}
