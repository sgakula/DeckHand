import type { BadgeTone } from "./ui/Badge";
import type { IconName } from "./ui/Icon";
import type { NoteKind } from "@/lib/types";

/** One place deciding how each note kind reads, shared by Present and Debrief. */
export const NOTE_META: Record<NoteKind, { label: string; icon: IconName; tone: BadgeTone }> = {
  audience_question: { label: "Question", icon: "brief", tone: "accent" },
  commitment: { label: "Commitment", icon: "checkCircle", tone: "success" },
  objection: { label: "Objection", icon: "warning", tone: "danger" },
  unsourced_claim: { label: "Unsourced claim", icon: "warning", tone: "warning" },
  number_mismatch: { label: "Number mismatch", icon: "warning", tone: "danger" },
  skipped_section: { label: "Skipped section", icon: "arrowRight", tone: "neutral" },
  rushed_section: { label: "Rushed", icon: "clock", tone: "warning" },
};

export function noteMeta(kind: NoteKind) {
  return NOTE_META[kind] ?? { label: kind, icon: "info" as IconName, tone: "neutral" as BadgeTone };
}
